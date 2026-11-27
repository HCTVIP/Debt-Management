-- Chạy file này 1 lần trong Supabase > SQL Editor (an toàn khi chạy lại)
create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,   -- đơn hàng là khoá chính của chuyến
  ship_date date not null default current_date,
  vehicle text,                                                      -- biển số xe
  driver text,
  fee numeric(14,2) not null default 0 check (fee >= 0),            -- cước vận chuyển
  status text not null default 'pending' check (status in ('pending','shipping','delivered')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ship_order on shipments(order_id);
create index if not exists idx_ship_date on shipments(ship_date);

alter table shipments enable row level security;
revoke all on shipments from anon, authenticated;

-- Tạo chuyến từ ghi chú "Xe ..." của các đơn đã nhập từ Excel (bỏ qua đơn đã có chuyến)
insert into shipments (order_id, ship_date, vehicle, status, note)
select o.id, o.order_date, trim(regexp_replace(o.note, '^Xe ', '')), 'delivered', 'Nhập từ Excel'
from orders o
where o.note like 'Xe %'
  and not exists (select 1 from shipments s where s.order_id = o.id);
