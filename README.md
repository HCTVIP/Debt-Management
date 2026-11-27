# Quản lý tài chính (hàng hóa & công nợ)

Website responsive (dùng tốt trên iPhone): React (Vite) + Node.js (Express) + Supabase.

```
client/   giao diện React (Vite)
server.js API Express + phục vụ bản build (dist/)
supabase/schema.sql  tạo bảng, view, hàm
```

## Chạy
1. Supabase > SQL Editor: chạy lần lượt `supabase/schema.sql`, `002_shipments.sql`, `003_cashflow.sql`, `004_shipment_location.sql`, `005_integrity.sql` (các file đều an toàn khi chạy lại).
   **`005_integrity.sql` là bắt buộc** với bản server hiện tại: sửa đơn, thêm / sửa thanh toán, tổng quan và công nợ đều gọi các hàm SQL trong file này. Chạy nó **trước khi deploy** bản mới; nếu chưa chạy, các chức năng đó báo "Chưa cập nhật cơ sở dữ liệu".
2. `cp .env.example .env` và điền SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret key), APP_PASSWORD, TOKEN_SECRET.
3. Production: `npm install && npm run build && npm start` → http://localhost:3000
4. Phát triển: mở 2 terminal, `npm run dev:server` và `npm run dev:client` → http://localhost:5173 (Vite proxy `/api` sang Express).

## Deploy
Dùng `Dockerfile` (Render / Railway / Fly.io): đặt 4 biến môi trường ở trên; không commit `.env`.
Container chạy bằng user `node` (không phải root) và có `HEALTHCHECK` gọi `/healthz`. Server tắt êm khi nhận SIGTERM.
`TOKEN_SECRET` nên là chuỗi ngẫu nhiên từ 32 ký tự, `APP_PASSWORD` từ 10 ký tự (ngắn hơn chỉ bị cảnh báo trong log, không bị chặn).

## Kiểm thử
`npm test` chạy hai nhóm test bằng `node --test`, không cần Supabase hay mạng:
- `test/sql.test.mjs`: dựng Postgres trong bộ nhớ (PGlite) với đúng các file `supabase/*.sql`, kiểm tra tạo / sửa / xoá đơn, thanh toán, tồn kho, audit log, quyền và các hàm tổng hợp.
- `test/lib.test.mjs`: token, giới hạn đăng nhập, lọc kỳ, che lỗi hệ thống, chặn chuyển hướng ra ngoài Google ở `/api/maps/resolve`.

PGlite chạy một kết nối nên **không** kiểm được lỗi tranh chấp khi hai người ghi cùng lúc; phần đó dựa vào khoá dòng (`for update`) trong hàm SQL.

## Nhật ký thay đổi (audit_log)
Mọi lần sửa hoặc xoá đơn, thanh toán, thu chi đều được ghi vào bảng `audit_log` (dữ liệu cũ và mới ở dạng JSON; xoá đơn ghi luôn các thanh toán bị xoá theo). Bảng chỉ server đọc được. Xem trong Supabase > Table Editor, ví dụ:
```sql
select at, action, table_name, old_data, new_data from audit_log order by at desc limit 50;
```

## Sao lưu
Dữ liệu nằm hoàn toàn ở Supabase. Nên sao lưu định kỳ bằng `pg_dump` (lấy chuỗi kết nối ở Supabase > Project Settings > Database), ví dụ:
```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom --file="backup-$(date +%F).dump"
```
Ảnh trong Storage (`product-images`, `delivery-proofs`) không nằm trong bản dump; cần sao lưu riêng nếu muốn giữ. Bucket `delivery-proofs` là riêng tư: ảnh chỉ xem được qua đường dẫn tạm (hết hạn sau 1 giờ) do server cấp.

## Vận chuyển: vị trí giao hàng, khoảng cách, ảnh xác nhận
- Chạy `supabase/004_shipment_location.sql` 1 lần để thêm cột vị trí / khoảng cách cho bảng `shipments`.
- (Tuỳ chọn) Đặt `GOOGLE_MAPS_API_KEY` để tìm địa chỉ, lấy địa chỉ từ vị trí hiện tại và tính khoảng cách theo đường đi.
  Khoá chỉ dùng ở server (không lộ ra trình duyệt). Cần bật **Geocoding API** và **Routes API**, nên giới hạn khoá theo API.
- Ảnh xác nhận giao hàng lưu ở Supabase Storage (bucket `delivery-proofs`).

### Bản đồ chọn vị trí trong app
- Bấm **Tìm** ở điểm nhận / giao: mở bản đồ ngay trong app (không mở tab mới), tìm địa chỉ hoặc chạm lên bản đồ để chọn điểm.
- Có `GOOGLE_MAPS_BROWSER_KEY` thì hiện bản đồ Google; không có thì hiện bản đồ OpenStreetMap (Leaflet).
- `GOOGLE_MAPS_API_KEY` (máy chủ) dùng để tìm địa chỉ và tính đường đi; `GOOGLE_MAPS_BROWSER_KEY` (trình duyệt) chỉ để hiện bản đồ Google.
  Khoá trình duyệt sẽ lộ ra phía người dùng nên phải giới hạn theo tên miền web và chỉ bật Maps JavaScript API.
