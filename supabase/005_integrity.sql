-- Chạy file này 1 lần trong Supabase > SQL Editor (an toàn khi chạy lại). BẮT BUỘC chạy trước khi deploy bản server mới.
-- Toàn vẹn dữ liệu tiền:
--   * Ngày mặc định theo giờ Việt Nam (trước đây theo UTC, 0h-7h sáng bị lùi 1 ngày)
--   * Mã đơn dùng sequence (không trùng khi 2 đơn cùng giây)
--   * Sửa đơn / thêm-sửa thanh toán chạy trong 1 transaction, khoá dòng đơn để không vượt công nợ hay lệch tồn kho khi gọi đồng thời
--   * Tạo đơn kiểm đối tác đúng loại (nhà cung cấp cho đơn nhập, khách hàng cho đơn bán)
--   * Nhật ký audit_log: ghi lại mọi lần sửa / xoá đơn, thanh toán, thu chi
--   * Hàm tổng hợp dashboard_data / debts_by_partner để không tải toàn bộ lịch sử về server
--   * Index cho các cột lọc theo kỳ

-- ---------- 1. Ngày theo giờ Việt Nam ----------
create or replace function vn_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

alter table orders alter column order_date set default vn_today();
alter table payments alter column paid_at set default vn_today();

-- Bảng thu chi (003) cần có để hàm dashboard dùng; tạo nếu chưa có
create table if not exists cashflow (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('in','out')),
  entry_date date not null default vn_today(),
  amount numeric(14,2) not null check (amount > 0),
  category text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_cashflow_date on cashflow(entry_date);
alter table cashflow enable row level security;
revoke all on cashflow from anon, authenticated;
alter table cashflow alter column entry_date set default vn_today();

do $$
begin
  if to_regclass('public.shipments') is not null then
    execute 'alter table shipments alter column ship_date set default vn_today()';
  end if;
end $$;

-- ---------- 2. Index theo kỳ ----------
create index if not exists idx_orders_date on orders(order_date);
create index if not exists idx_orders_code on orders(code);
create index if not exists idx_pay_date on payments(paid_at);

-- ---------- 3. Mã đơn bằng sequence ----------
create sequence if not exists order_code_seq;

create or replace function next_order_code(p_type text) returns text
language sql as $$
  select (case when p_type = 'in' then 'NH' else 'BH' end)
      || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD')
      || case when s.n < 1000000 then lpad(s.n::text, 6, '0') else s.n::text end
  from (select nextval('order_code_seq') as n) s
$$;

-- ---------- 4. Nhật ký thay đổi ----------
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,               -- update | delete
  table_name text not null,
  row_id uuid,
  old_data jsonb,
  new_data jsonb
);
create index if not exists idx_audit_at on audit_log(at);
create index if not exists idx_audit_row on audit_log(table_name, row_id);
alter table audit_log enable row level security;
revoke all on audit_log from anon, authenticated;

create or replace function audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into audit_log(action, table_name, row_id, old_data)
    values ('delete', tg_table_name, old.id, to_jsonb(old));
    return old;
  end if;
  if to_jsonb(new) is distinct from to_jsonb(old) then
    insert into audit_log(action, table_name, row_id, old_data, new_data)
    values ('update', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;

drop trigger if exists trg_audit on orders;
create trigger trg_audit after update or delete on orders for each row execute function audit_change();
drop trigger if exists trg_audit on payments;
create trigger trg_audit after update or delete on payments for each row execute function audit_change();
drop trigger if exists trg_audit on cashflow;
create trigger trg_audit after update or delete on cashflow for each row execute function audit_change();

-- ---------- 5. Tạo đơn ----------
create or replace function create_order(p jsonb) returns uuid
language plpgsql as $$
declare
  oid uuid; it jsonb; v_total numeric := 0; v_type text := p->>'type';
  v_paid numeric := coalesce((p->>'paid')::numeric, 0);
  v_pid uuid := (p->>'partner_id')::uuid; v_ptype text;
begin
  if v_type is null or v_type not in ('in','out') then raise exception 'type không hợp lệ'; end if;
  select type into v_ptype from partners where id = v_pid;
  if v_ptype is null then raise exception 'Không tìm thấy đối tác'; end if;
  if v_ptype <> (case when v_type = 'in' then 'supplier' else 'customer' end) then
    raise exception 'Đối tác không đúng loại của đơn';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Đơn hàng cần ít nhất 1 mặt hàng'; end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_total := v_total + (it->>'qty')::numeric * (it->>'price')::numeric;
  end loop;
  if v_paid < 0 then raise exception 'Số tiền không hợp lệ'; end if;
  if v_paid > v_total then raise exception 'Số tiền trả vượt tổng đơn'; end if;

  insert into orders(code, type, partner_id, order_date, total, note)
  values (next_order_code(v_type), v_type, v_pid,
          coalesce(nullif(p->>'order_date', '')::date, vn_today()), v_total, nullif(p->>'note', ''))
  returning id into oid;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into order_items(order_id, product_id, qty, price)
    values (oid, (it->>'product_id')::uuid, (it->>'qty')::numeric, (it->>'price')::numeric);
    update products set stock = stock + (case when v_type = 'in' then 1 else -1 end) * (it->>'qty')::numeric
    where id = (it->>'product_id')::uuid;
  end loop;

  if v_paid > 0 then insert into payments(order_id, amount) values (oid, v_paid); end if;
  return oid;
end $$;

-- ---------- 6. Sửa đơn (1 transaction, khoá dòng đơn) ----------
-- Đơn có mặt hàng: thay toàn bộ mặt hàng, tồn kho điều chỉnh nguyên tử; phần chênh giữa Tổng đơn và tổng mặt hàng
-- (VC ngoài nhập từ Excel...) được giữ nguyên. Đơn không có mặt hàng (nợ đầu kỳ / điều chỉnh): sửa trực tiếp Tổng tiền.
create or replace function update_order(oid uuid, p jsonb) returns uuid
language plpgsql as $$
declare
  o orders%rowtype; v_paid numeric; v_old_gross numeric; v_total numeric; v_ptype text;
  v_pid uuid := (p->>'partner_id')::uuid; it jsonb; v_has_items boolean; sgn int;
begin
  select * into o from orders where id = oid for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  select type into v_ptype from partners where id = v_pid;
  if v_ptype is null then raise exception 'Không tìm thấy đối tác'; end if;
  if v_ptype <> (case when o.type = 'in' then 'supplier' else 'customer' end) then
    raise exception 'Đối tác không đúng loại của đơn';
  end if;

  select coalesce(sum(amount), 0) into v_paid from payments where order_id = oid;
  select coalesce(sum(qty * price), 0), count(*) > 0 into v_old_gross, v_has_items from order_items where order_id = oid;

  if v_has_items then
    if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Đơn hàng cần ít nhất 1 mặt hàng'; end if;
    select coalesce(sum((i->>'qty')::numeric * (i->>'price')::numeric), 0) + (o.total - v_old_gross)
      into v_total from jsonb_array_elements(p->'items') i;
  else
    v_total := (p->>'total')::numeric;
    if v_total is null or v_total < 0 then raise exception 'Tổng tiền không hợp lệ'; end if;
  end if;
  if v_total + 0.5 < v_paid then raise exception 'Tổng đơn nhỏ hơn số tiền đã thanh toán, hãy sửa thanh toán trước'; end if;

  if v_has_items then
    sgn := case when o.type = 'in' then 1 else -1 end;
    update products pr set stock = pr.stock - sgn * x.q
    from (select product_id, sum(qty) q from order_items where order_id = oid group by product_id) x
    where pr.id = x.product_id;
    delete from order_items where order_id = oid;
    for it in select * from jsonb_array_elements(p->'items') loop
      insert into order_items(order_id, product_id, qty, price)
      values (oid, (it->>'product_id')::uuid, (it->>'qty')::numeric, (it->>'price')::numeric);
      update products set stock = stock + sgn * (it->>'qty')::numeric where id = (it->>'product_id')::uuid;
    end loop;
  end if;

  update orders set partner_id = v_pid,
         order_date = coalesce(nullif(p->>'order_date', '')::date, order_date),
         note = nullif(p->>'note', ''),
         total = v_total
   where id = oid;
  return oid;
end $$;

-- ---------- 7. Xoá đơn (khoá dòng, hoàn tồn kho; audit_log tự ghi đơn và các thanh toán bị xoá theo) ----------
create or replace function delete_order(oid uuid) returns void
language plpgsql as $$
declare v_type text;
begin
  select type into v_type from orders where id = oid for update;
  if v_type is null then raise exception 'Không tìm thấy đơn'; end if;
  update products pr set stock = pr.stock - (case when v_type = 'in' then 1 else -1 end) * x.q
  from (select product_id, sum(qty) q from order_items where order_id = oid group by product_id) x
  where pr.id = x.product_id;
  delete from orders where id = oid;
end $$;

-- ---------- 8. Thanh toán: kiểm công nợ dưới khoá dòng đơn ----------
create or replace function add_payment(oid uuid, amt numeric, d date, n text) returns uuid
language plpgsql as $$
declare v_total numeric; v_paid numeric; pid uuid;
begin
  if amt is null or amt <= 0 then raise exception 'Số tiền không hợp lệ'; end if;
  select total into v_total from orders where id = oid for update;
  if v_total is null then raise exception 'Không tìm thấy đơn'; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where order_id = oid;
  if amt > v_total - v_paid then raise exception 'Số tiền vượt công nợ còn lại'; end if;
  insert into payments(order_id, amount, paid_at, note)
  values (oid, amt, coalesce(d, vn_today()), nullif(n, ''))
  returning id into pid;
  return pid;
end $$;

create or replace function update_payment(pid uuid, amt numeric, d date, n text) returns uuid
language plpgsql as $$
declare v_oid uuid; v_total numeric; v_others numeric;
begin
  if amt is null or amt <= 0 then raise exception 'Số tiền không hợp lệ'; end if;
  select order_id into v_oid from payments where id = pid;
  if v_oid is null then raise exception 'Không tìm thấy thanh toán'; end if;
  select total into v_total from orders where id = v_oid for update;
  select coalesce(sum(amount), 0) into v_others from payments where order_id = v_oid and id <> pid;
  if v_others + amt > v_total + 0.5 then raise exception 'Số tiền vượt tổng đơn'; end if;
  update payments set amount = amt, paid_at = coalesce(d, paid_at), note = nullif(n, '') where id = pid;
  return pid;
end $$;

-- ---------- 9. Tổng hợp trong DB (kỳ [p_from, p_to), cả hai null = toàn bộ) ----------
create or replace function dashboard_data(p_from date, p_to date) returns jsonb
language plpgsql stable as $$
declare
  v_first date; v_last_ex date; v_monthly boolean;
begin
  -- Kỳ dài hơn 45 ngày thì gom biểu đồ theo tháng, ngược lại theo ngày. Không lọc kỳ: lấy theo dữ liệu thật.
  if p_from is not null then
    v_first := p_from;
    v_last_ex := p_to;
  else
    select min(d), max(d) into v_first, v_last_ex from (
      select order_date d from orders
      union all select paid_at from payments
      union all select entry_date from cashflow) x;
  end if;
  v_monthly := v_first is not null and v_last_ex is not null and (v_last_ex - v_first) > 45;

  return (
    with
    o as (select partner_name, type, total, debt, order_date from order_summary
          where (p_from is null or order_date >= p_from) and (p_to is null or order_date < p_to)),
    pay as (select py.amount, py.paid_at, od.type from payments py join orders od on od.id = py.order_id
            where (p_from is null or py.paid_at >= p_from) and (p_to is null or py.paid_at < p_to)),
    cash as (select kind, amount, entry_date from cashflow
             where (p_from is null or entry_date >= p_from) and (p_to is null or entry_date < p_to)),
    ser as (
      select k, sum(sold) as sold, sum(collected) as collected, sum(spent) as spent from (
        select case when v_monthly then to_char(order_date, 'YYYY-MM') else to_char(order_date, 'YYYY-MM-DD') end as k,
               total as sold, 0::numeric as collected, 0::numeric as spent from o where type = 'out'
        union all
        select case when v_monthly then to_char(paid_at, 'YYYY-MM') else to_char(paid_at, 'YYYY-MM-DD') end,
               0::numeric, amount, 0::numeric from pay where type = 'out'
        union all
        select case when v_monthly then to_char(entry_date, 'YYYY-MM') else to_char(entry_date, 'YYYY-MM-DD') end,
               0::numeric, 0::numeric, amount from cash where kind = 'out'
      ) u group by k),
    tc as (select partner_name as name, sum(total) as value, sum(debt) as debt from o
           where type = 'out' group by partner_name order by sum(total) desc, partner_name limit 5),
    tp as (select coalesce(pr.name, '---') as name, sum(oi.qty * oi.price) as value
           from order_items oi
           join orders od on od.id = oi.order_id
           left join products pr on pr.id = oi.product_id
           where od.type = 'out' and (p_from is null or od.order_date >= p_from) and (p_to is null or od.order_date < p_to)
           group by coalesce(pr.name, '---') order by sum(oi.qty * oi.price) desc, coalesce(pr.name, '---') limit 5)
    select jsonb_build_object(
      'payable', coalesce((select sum(debt) from o where type = 'in'), 0),
      'receivable', coalesce((select sum(debt) from o where type = 'out'), 0),
      'purchased', coalesce((select sum(total) from o where type = 'in'), 0),
      'sold', coalesce((select sum(total) from o where type = 'out'), 0),
      'collected', coalesce((select sum(amount) from pay where type = 'out'), 0),
      'paid_out', coalesce((select sum(amount) from pay where type = 'in'), 0),
      'customers', (select count(*) from partners where type = 'customer'),
      'other_in', coalesce((select sum(amount) from cash where kind = 'in'), 0),
      'spent', coalesce((select sum(amount) from cash where kind = 'out'), 0),
      'stock_value', coalesce((select sum(stock * cost_price) from products), 0),
      'low_stock', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit, 'stock', stock,
                       'min_stock', min_stock, 'cost_price', cost_price) order by name)
                     from products where stock <= min_stock), '[]'::jsonb),
      'group', case when v_monthly then 'month' else 'day' end,
      'series', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'sold', sold, 'collected', collected, 'spent', spent) order by k)
                          from ser), '[]'::jsonb),
      'top_customers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'value', value, 'debt', debt) order by value desc, name)
                                 from tc), '[]'::jsonb),
      'top_products', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'value', value) order by value desc, name)
                                from tp), '[]'::jsonb)
    )
  );
end $$;

-- Công nợ còn lại theo đối tác (chỉ đơn còn nợ trong kỳ), nhiều nợ nhất trước
create or replace function debts_by_partner(p_from date, p_to date)
returns table(partner_id uuid, partner_name text, type text, debt numeric, orders bigint)
language sql stable as $$
  select s.partner_id, max(s.partner_name), min(s.type), sum(s.debt), count(*)
  from order_summary s
  where s.debt > 0 and (p_from is null or s.order_date >= p_from) and (p_to is null or s.order_date < p_to)
  group by s.partner_id
  order by sum(s.debt) desc, s.partner_id
$$;

-- ---------- 10. Quyền: chỉ server (service_role) gọi được các hàm ----------
revoke all on function next_order_code(text), create_order(jsonb), update_order(uuid, jsonb), delete_order(uuid),
  add_payment(uuid, numeric, date, text), update_payment(uuid, numeric, date, text),
  dashboard_data(date, date), debts_by_partner(date, date), audit_change() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function next_order_code(text), create_order(jsonb), update_order(uuid, jsonb), delete_order(uuid),
      add_payment(uuid, numeric, date, text), update_payment(uuid, numeric, date, text),
      dashboard_data(date, date), debts_by_partner(date, date) to service_role';
  end if;
end $$;
