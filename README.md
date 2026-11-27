# Quản lý tài chính (hàng hóa & công nợ)

Website responsive (dùng tốt trên iPhone): React (Vite) + Node.js (Express) + Supabase.

```
client/   giao diện React (Vite)
server.js API Express + phục vụ bản build (dist/)
supabase/schema.sql  tạo bảng, view, hàm
```

## Chạy
1. Supabase > SQL Editor: chạy `supabase/schema.sql`.
2. `cp .env.example .env` và điền SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret key), APP_PASSWORD, TOKEN_SECRET.
3. Production: `npm install && npm run build && npm start` → http://localhost:3000
4. Phát triển: mở 2 terminal, `npm run dev:server` và `npm run dev:client` → http://localhost:5173 (Vite proxy `/api` sang Express).

## Deploy
Dùng `Dockerfile` (Render / Railway / Fly.io): đặt 4 biến môi trường ở trên; không commit `.env`.

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
