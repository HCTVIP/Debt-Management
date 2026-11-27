-- Chạy file này 1 lần trong Supabase > SQL Editor (an toàn khi chạy lại)
-- Vị trí nhận / giao hàng, khoảng cách và thời điểm giao cho bảng shipments.
-- Ảnh xác nhận giao hàng lưu ở Supabase Storage (bucket delivery-proofs), không cần cột.
alter table shipments
  add column if not exists pickup_address text,
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists delivery_address text,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision,
  add column if not exists distance_km numeric(8,2),
  add column if not exists duration_min integer,
  add column if not exists delivered_at timestamptz;
