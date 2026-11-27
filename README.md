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
