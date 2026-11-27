-- Chạy toàn bộ file này trong Supabase > SQL Editor
create extension if not exists pgcrypto;

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('supplier','customer')),
  phone text,
  address text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'cái',
  cost_price numeric(14,2) not null default 0,
  sale_price numeric(14,2) not null default 0,
  stock numeric(14,2) not null default 0,
  min_stock numeric(14,2) not null default 0,
  supplier_id uuid references partners(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  type text not null check (type in ('in','out')),       -- in: nhập hàng (phải trả), out: bán hàng (phải thu)
  partner_id uuid not null references partners(id),
  order_date date not null default current_date,
  total numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(14,2) not null check (qty > 0),
  price numeric(14,2) not null check (price >= 0)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_partner on orders(partner_id);
create index if not exists idx_items_order on order_items(order_id);
create index if not exists idx_pay_order on payments(order_id);

create or replace view order_summary as
select o.*, p.name as partner_name,
       coalesce(pm.paid,0) as paid,
       o.total - coalesce(pm.paid,0) as debt
from orders o
join partners p on p.id = o.partner_id
left join (select order_id, sum(amount) paid from payments group by order_id) pm on pm.order_id = o.id;

-- Tạo đơn + chi tiết + cập nhật tồn kho + thanh toán ban đầu trong 1 transaction
create or replace function create_order(p jsonb) returns uuid
language plpgsql as $$
declare
  oid uuid; it jsonb; v_total numeric := 0; v_type text := p->>'type'; v_paid numeric := coalesce((p->>'paid')::numeric,0);
begin
  if v_type not in ('in','out') then raise exception 'type không hợp lệ'; end if;
  if jsonb_array_length(coalesce(p->'items','[]'::jsonb)) = 0 then raise exception 'Đơn hàng cần ít nhất 1 mặt hàng'; end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_total := v_total + (it->>'qty')::numeric * (it->>'price')::numeric;
  end loop;
  if v_paid > v_total then raise exception 'Số tiền trả vượt tổng đơn'; end if;

  insert into orders(code, type, partner_id, order_date, total, note)
  values ((case when v_type='in' then 'NH' else 'BH' end) || to_char(now(),'YYMMDDHH24MISS'),
          v_type, (p->>'partner_id')::uuid, coalesce((p->>'order_date')::date, current_date), v_total, p->>'note')
  returning id into oid;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into order_items(order_id, product_id, qty, price)
    values (oid, (it->>'product_id')::uuid, (it->>'qty')::numeric, (it->>'price')::numeric);
    update products set stock = stock + (case when v_type='in' then 1 else -1 end) * (it->>'qty')::numeric
    where id = (it->>'product_id')::uuid;
  end loop;

  if v_paid > 0 then insert into payments(order_id, amount) values (oid, v_paid); end if;
  return oid;
end $$;

-- Xoá đơn và hoàn tồn kho
create or replace function delete_order(oid uuid) returns void
language plpgsql as $$
declare v_type text;
begin
  select type into v_type from orders where id = oid;
  if v_type is null then raise exception 'Không tìm thấy đơn'; end if;
  update products pr set stock = pr.stock - (case when v_type='in' then 1 else -1 end) * x.q
  from (select product_id, sum(qty) q from order_items where order_id = oid group by product_id) x
  where pr.id = x.product_id;
  delete from orders where id = oid;
end $$;

-- Chặn truy cập trực tiếp bằng anon key; server dùng service role (bỏ qua RLS)
alter table partners enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
revoke all on function create_order(jsonb), delete_order(uuid) from public, anon, authenticated;

-- View mặc định bỏ qua RLS: chặn anon/authenticated đọc trực tiếp
revoke all on order_summary from anon, authenticated;
