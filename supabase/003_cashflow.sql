-- Chạy file này 1 lần trong Supabase > SQL Editor (an toàn khi chạy lại)
-- Khoản thu khác / chi. Khoản thu từ khách lấy từ bảng payments nên không nhập lại ở đây.
create table if not exists cashflow (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('in','out')),          -- in: thu khác, out: chi
  entry_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  category text,                                             -- ví dụ: Xăng dầu, Lương, Sửa xe
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_cashflow_date on cashflow(entry_date);

alter table cashflow enable row level security;
revoke all on cashflow from anon, authenticated;
