# Quản lý tài chính (hàng hóa & công nợ)

Node.js (Express) + Supabase + JS thuần (mobile-first, dùng tốt trên iPhone).

## Chạy
1. Supabase > SQL Editor: chạy `supabase/schema.sql`.
2. `cp .env.example .env` và điền SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_PASSWORD, TOKEN_SECRET.
3. `npm install && npm run build && npm start` → http://localhost:3000

## Deploy
Dùng `Dockerfile` (Render / Railway / Fly.io): đặt 4 biến môi trường ở trên; không commit `.env`.
