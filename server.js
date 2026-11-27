import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import ExcelJS from 'exceljs'
import { createAuth, credentialsMatch } from './lib/auth.js'
import { dbError, describeError } from './lib/errors.js'
import { createFailureTracker, createLimiter } from './lib/limiter.js'
import { resolveMapsLink } from './lib/mapsGuard.js'
import { addDay, inPeriod, isDate, period } from './lib/period.js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_PASSWORD, TOKEN_SECRET, APP_USERNAME = 'admin', GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_BROWSER_KEY, PORT = 3000 } = process.env
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_PASSWORD, TOKEN_SECRET })) {
  if (!v) {
    console.error(`Thiếu biến môi trường ${k}`)
    process.exit(1)
  }
}
// Chỉ cảnh báo (không dừng) để không làm sập bản đang chạy nếu khoá hiện tại ngắn
if (TOKEN_SECRET.length < 32) console.warn('Cảnh báo: TOKEN_SECRET nên là chuỗi ngẫu nhiên dài từ 32 ký tự trở lên')
if (APP_PASSWORD.length < 10) console.warn('Cảnh báo: APP_PASSWORD nên dài từ 10 ký tự trở lên')

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } })
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1) // chạy sau proxy của Render: lấy đúng IP người dùng để giới hạn đăng nhập sai
// Ảnh hàng hóa nằm ở Supabase Storage (public) nên cho phép tải ảnh từ domain Supabase
// Bản đồ trong app: Google Maps JavaScript (khi có GOOGLE_MAPS_BROWSER_KEY) hoặc ô bản đồ OpenStreetMap (Leaflet)
const GOOGLE_IMG = ['https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.ggpht.com', 'https://*.google.com']
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://maps.googleapis.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', new URL(SUPABASE_URL).origin, 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org', ...GOOGLE_IMG],
        connectSrc: ["'self'", 'https://maps.googleapis.com', 'https://*.googleapis.com'],
        workerSrc: ["'self'", 'blob:']
      }
    }
  })
)
app.use(compression())

// ---- Auth: token = payload.hmac, hạn 7 ngày ----
const { makeToken, middleware: auth } = createAuth({ secret: TOKEN_SECRET })
const loginFails = createFailureTracker({ max: 10, windowMs: 15 * 60e3 })
// Đăng nhập đứng TRƯỚC xác thực nên chỉ nhận body rất nhỏ
app.use('/api/login', express.json({ limit: '2kb' }))
app.post('/api/login', (req, res) => {
  const ip = req.ip
  if (loginFails.blocked(ip)) return res.status(429).json({ error: 'Thử lại sau 15 phút' })
  if (!credentialsMatch(req.body?.username ?? '', req.body?.password ?? '', APP_USERNAME, APP_PASSWORD)) {
    loginFails.fail(ip)
    return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' })
  }
  loginFails.clear(ip)
  res.json({ token: makeToken(APP_USERNAME) })
})

app.get('/healthz', (_q, r) => r.send('ok'))
app.use('/api', auth)
app.use('/api', createLimiter({ max: 600, windowMs: 60e3 }))
// Body JSON chỉ được đọc SAU khi đã xác thực (người chưa đăng nhập không buộc server parse tới 3 MB)
app.use('/api/products/:id/image', express.json({ limit: '3mb' })) // ảnh base64 đã thu nhỏ ở trình duyệt
app.use('/api/shipments/:id/proofs', express.json({ limit: '3mb' }))
app.use('/api', express.json({ limit: '200kb' }))

const wrap = (fn) => async (req, res) => {
  try {
    const data = await fn(req)
    res.json(data ?? { ok: true })
  } catch (e) {
    sendError(req, res, e)
  }
}
const sendError = (req, res, e) => {
  const { status, body, log } = describeError(e)
  if (log) console.error('[api]', req.method, req.path, e.code || '', e.message)
  res.status(status).json(body)
}
const ok = ({ data, error }) => {
  if (error) throw dbError(error)
  return data
}
/** Gọi hàm SQL (supabase/005_integrity.sql). */
const rpc = async (fn, args) => ok(await db.rpc(fn, args))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const needUuid = (v, msg = 'Mã không hợp lệ') => {
  if (!UUID.test(String(v))) throw new Error(msg)
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
const need = (v, msg) => {
  if (v === undefined || v === null || String(v).trim() === '') throw new Error(msg)
}

// ---- CRUD đối tác / hàng hóa ----
// ---- Ảnh hàng hóa: Supabase Storage (bucket public), tên file = id hàng hóa, không cần thêm cột ----
const BUCKET = 'product-images'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Tạo bucket nếu chưa có; đã có thì cập nhật lại cấu hình (để bucket cũ cũng theo đúng public / private)
const ensureBucket = async (name, opts) => {
  const created = await db.storage.createBucket(name, opts)
  if (!created.error) return
  if (!/already exists/i.test(created.error.message)) throw created.error
  const { error } = await db.storage.updateBucket(name, opts)
  if (error) throw error
}
const bucketReady = (name, opts) => ensureBucket(name, opts).catch((e) => console.error('Storage:', name, e.message))
bucketReady(BUCKET, { public: true, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: IMAGE_TYPES }) // ảnh hàng hóa: không nhạy cảm
const imageMap = async () => {
  const { data, error } = await db.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) return new Map()
  return new Map(data.filter((f) => f.id).map((f) => [f.name, Date.parse(f.updated_at || f.created_at) || 0]))
}
const withImages = async (rows) => {
  const m = await imageMap()
  for (const r of Array.isArray(rows) ? rows : [rows]) r.image_url = m.has(r.id) ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${r.id}?v=${m.get(r.id)}` : null
  return rows
}
app.put('/api/products/:id/image', wrap(async (req) => {
  needUuid(req.params.id)
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data || ''))
  if (!m) throw new Error('Ảnh không hợp lệ (chỉ JPEG, PNG hoặc WebP)')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 2 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 2MB)')
  ok(await db.from('products').select('id').eq('id', req.params.id).single())
  const { error } = await db.storage.from(BUCKET).upload(req.params.id, buf, { contentType: m[1], upsert: true, cacheControl: '3600' })
  if (error) throw new Error(error.message)
}))
app.delete('/api/products/:id/image', wrap(async (req) => {
  needUuid(req.params.id)
  const { error } = await db.storage.from(BUCKET).remove([req.params.id])
  if (error) throw new Error(error.message)
}))

const crud = (route, table, fields, order, validate) => {
  app.get(`/api/${route}`, wrap(async (req) => {
    let q = db.from(table).select('*').order(order, { ascending: order === 'name' })
    if (req.query.type) q = q.eq('type', req.query.type)
    const rows = ok(await q)
    // ?debt=1: kèm tổng nợ còn lại của từng đối tác
    if (route === 'partners' && req.query.debt === '1') {
      const os = await fetchAll(() => db.from('order_summary').select('partner_id, debt').gt('debt', 0).order('id'))
      const d = new Map()
      for (const o of os) d.set(o.partner_id, (d.get(o.partner_id) || 0) + Number(o.debt))
      for (const r of rows) r.debt = d.get(r.id) || 0
    }
    return route === 'products' ? withImages(rows) : rows
  }))
  app.get(`/api/${route}/:id`, wrap(async (req) => {
    needUuid(req.params.id)
    const row = ok(await db.from(table).select('*').eq('id', req.params.id).single())
    return route === 'products' ? withImages(row) : row
  }))
  app.post(`/api/${route}`, wrap(async (req) => {
    const b = pick(req.body, fields)
    validate(b)
    return ok(await db.from(table).insert(b).select().single())
  }))
  app.put(`/api/${route}/:id`, wrap(async (req) => {
    needUuid(req.params.id)
    const b = pick(req.body, fields)
    validate(b)
    return ok(await db.from(table).update(b).eq('id', req.params.id).select().single())
  }))
  app.delete(`/api/${route}/:id`, wrap(async (req) => {
    needUuid(req.params.id)
    const { error } = await db.from(table).delete().eq('id', req.params.id)
    if (error) throw new Error(error.code === '23503' ? 'Đã có đơn hàng liên quan, không thể xoá' : error.message)
    if (route === 'products') await db.storage.from(BUCKET).remove([req.params.id]) // xoá luôn ảnh
  }))
}
crud('partners', 'partners', ['name', 'type', 'phone', 'address', 'note'], 'name', (b) => {
  need(b.name, 'Nhập tên')
  if (!['supplier', 'customer'].includes(b.type)) throw new Error('Loại không hợp lệ')
})
crud('products', 'products', ['name', 'unit', 'cost_price', 'sale_price', 'stock', 'min_stock', 'supplier_id'], 'name', (b) => {
  need(b.name, 'Nhập tên hàng')
  for (const k of ['cost_price', 'sale_price', 'stock', 'min_stock']) if (b[k] !== undefined && !(Number(b[k]) >= 0)) throw new Error('Số không hợp lệ')
  if (b.supplier_id === '') b.supplier_id = null
  if (b.supplier_id) needUuid(b.supplier_id, 'Nhà cung cấp không hợp lệ')
})

// Supabase giới hạn 1000 dòng / lần: lấy hết theo trang
const fetchAll = async (build) => {
  const out = []
  for (let from = 0; ; from += 1000) {
    const rows = ok(await build().range(from, from + 999))
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

// ---- Đơn hàng ----
app.get('/api/orders', wrap(async (req) => {
  const p = period(req.query)
  const limit = Math.min(Number(req.query.limit) || 0, 200)
  const run = limit ? async (b) => ok(await b().range(0, limit - 1)) : fetchAll
  return run(() => {
    let q = db.from('order_summary').select('*').order('order_date', { ascending: false }).order('code', { ascending: false }).order('id', { ascending: false })
    if (req.query.type) q = q.eq('type', req.query.type)
    if (req.query.partner_id) q = q.eq('partner_id', req.query.partner_id)
    if (req.query.open === '1') q = q.gt('debt', 0)
    const text = String(req.query.q || '').replace(/[,()%*\\]/g, ' ').trim()
    if (text) q = q.or(`code.ilike.%${text}%,partner_name.ilike.%${text}%`)
    return inPeriod(q, p)
  })
}))
/** Danh sách mặt hàng của đơn: đúng cấu trúc, SL > 0, giá >= 0. */
const orderItems = (raw) => {
  const items = (Array.isArray(raw) ? raw : []).map((i) => ({ product_id: i?.product_id, qty: Number(i?.qty), price: Number(i?.price) }))
  if (!items.length || items.some((i) => !UUID.test(String(i.product_id)) || !(i.qty > 0) || !(i.price >= 0))) throw new Error('Mặt hàng không hợp lệ')
  return items
}
app.get('/api/orders/:id', wrap(async (req) => {
  const id = req.params.id
  needUuid(id)
  const [o, items, pays] = await Promise.all([
    db.from('order_summary').select('*').eq('id', id).single(),
    db.from('order_items').select('*, products(name, unit)').eq('order_id', id),
    db.from('payments').select('*').eq('order_id', id).order('paid_at')
  ])
  return { ...ok(o), items: ok(items), payments: ok(pays) }
}))
app.post('/api/orders', wrap(async (req) => {
  const b = req.body
  need(b.partner_id, 'Chọn đối tác')
  needUuid(b.partner_id, 'Đối tác không hợp lệ')
  const items = orderItems(b.items)
  const id = await rpc('create_order', { p: { type: b.type, partner_id: b.partner_id, order_date: dateOrNull(b.order_date), note: noteOrNull(b.note), paid: Number(b.paid) || 0, items } })
  return { id }
}))
// Sửa đơn chạy trong 1 transaction của hàm SQL update_order (khoá dòng đơn, tồn kho điều chỉnh nguyên tử):
// đơn có mặt hàng thì thay toàn bộ mặt hàng; đơn không có mặt hàng (nợ đầu kỳ / điều chỉnh) thì sửa trực tiếp tổng tiền.
app.put('/api/orders/:id', wrap(async (req) => {
  needUuid(req.params.id)
  const b = req.body
  need(b.partner_id, 'Chọn đối tác')
  needUuid(b.partner_id, 'Đối tác không hợp lệ')
  const p = { partner_id: b.partner_id, order_date: dateOrNull(b.order_date), note: noteOrNull(b.note) }
  if (b.items !== undefined) p.items = orderItems(b.items)
  if (b.total !== undefined) {
    p.total = Number(b.total)
    if (!(p.total >= 0)) throw new Error('Tổng tiền không hợp lệ')
  }
  await rpc('update_order', { oid: req.params.id, p })
  return { id: req.params.id }
}))
/** Ngày YYYY-MM-DD hoặc null (bỏ trống = để DB dùng ngày hôm nay theo giờ Việt Nam). */
const dateOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null
  if (!isDate(String(v))) throw new Error('Ngày không hợp lệ')
  return String(v)
}
const noteOrNull = (v) => String(v ?? '').trim().slice(0, 500) || null
const payRow = async (id) => ok(await db.from('payments').select('*').eq('id', id).single())
app.put('/api/payments/:id', wrap(async (req) => {
  needUuid(req.params.id)
  const amount = Number(req.body.amount)
  if (!(amount > 0)) throw new Error('Số tiền không hợp lệ')
  await rpc('update_payment', { pid: req.params.id, amt: amount, d: dateOrNull(req.body.paid_at), n: noteOrNull(req.body.note) })
  return payRow(req.params.id)
}))
app.delete('/api/orders/:id', wrap(async (req) => {
  needUuid(req.params.id)
  await rpc('delete_order', { oid: req.params.id })
}))
app.post('/api/orders/:id/payments', wrap(async (req) => {
  needUuid(req.params.id)
  const amount = Number(req.body.amount)
  if (!(amount > 0)) throw new Error('Số tiền không hợp lệ')
  const id = await rpc('add_payment', { oid: req.params.id, amt: amount, d: dateOrNull(req.body.paid_at), n: noteOrNull(req.body.note) })
  return payRow(id)
}))
app.delete('/api/payments/:id', wrap(async (req) => {
  needUuid(req.params.id)
  ok(await db.from('payments').delete().eq('id', req.params.id))
}))

// ---- Vận chuyển: mỗi chuyến thuộc về một đơn hàng (đơn hàng là khoá chính) ----
const SHIP_STATUS = ['pending', 'shipping', 'delivered']
const shipErr = (e) => {
  const m = e.message || ''
  if (/(pickup_|delivery_|distance_km|duration_min|delivered_at)/.test(m) && /(column|schema cache)/.test(m)) return new Error('Chưa thêm cột vị trí giao hàng: chạy supabase/004_shipment_location.sql trong Supabase SQL Editor')
  if (/shipments/.test(m) && /(does not exist|schema cache)/.test(m)) return new Error('Chưa tạo bảng vận chuyển: chạy supabase/002_shipments.sql trong Supabase SQL Editor')
  return e
}
const shipBody = (b) => {
  need(b.order_id, 'Chọn đơn hàng')
  const fee = b.fee === '' || b.fee == null ? 0 : Number(b.fee)
  if (!(fee >= 0)) throw new Error('Cước phí không hợp lệ')
  const status = b.status || 'pending'
  if (!SHIP_STATUS.includes(status)) throw new Error('Trạng thái không hợp lệ')
  const out = { order_id: b.order_id, ship_date: b.ship_date || undefined, vehicle: String(b.vehicle || '').trim() || null, driver: String(b.driver || '').trim() || null, fee, status, note: String(b.note || '').trim() || null }
  // Vị trí giao hàng (cần chạy supabase/004_shipment_location.sql)
  const text = (v) => String(v || '').trim().slice(0, 300) || null
  const coord = (v, lim, msg) => {
    if (v === '' || v == null) return null
    const n = Number(v)
    if (!(Math.abs(n) <= lim)) throw new Error(msg)
    return n
  }
  const loc = {
    pickup_address: text(b.pickup_address),
    pickup_lat: coord(b.pickup_lat, 90, 'Vĩ độ điểm nhận không hợp lệ'),
    pickup_lng: coord(b.pickup_lng, 180, 'Kinh độ điểm nhận không hợp lệ'),
    delivery_address: text(b.delivery_address),
    delivery_lat: coord(b.delivery_lat, 90, 'Vĩ độ điểm giao không hợp lệ'),
    delivery_lng: coord(b.delivery_lng, 180, 'Kinh độ điểm giao không hợp lệ'),
    distance_km: b.distance_km === '' || b.distance_km == null ? null : Math.max(0, Number(b.distance_km)) || 0,
    duration_min: b.duration_min === '' || b.duration_min == null ? null : Math.max(0, Math.round(Number(b.duration_min))) || 0,
    delivered_at: status === 'delivered' ? b.delivered_at || new Date().toISOString() : null
  }
  // Chưa có cột mới thì chỉ gửi các trường có dữ liệu, để chuyến xe cũ vẫn lưu được
  return { ...out, ...(locationColumns.ready ? loc : Object.fromEntries(Object.entries(loc).filter(([, v]) => v !== null))) }
}
const locationColumns = { ready: false }
const probeLocation = async () => {
  if (locationColumns.ready) return
  const { error } = await db.from('shipments').select('pickup_address').limit(1)
  locationColumns.ready = !error
}
const SHIP_SELECT = '*, orders(code, order_date, total, partner_id, partners(name))'
app.get('/api/shipments', wrap(async (req) => {
  const p = period(req.query)
  try {
    return await fetchAll(() => {
      let q = db.from('shipments').select(SHIP_SELECT).order('ship_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
      if (req.query.order_id) q = q.eq('order_id', req.query.order_id)
      if (req.query.status) q = q.eq('status', req.query.status)
      return inPeriod(q, p, 'ship_date')
    })
  } catch (e) {
    throw shipErr(e)
  }
}))
app.post('/api/shipments', wrap(async (req) => {
  try {
    await probeLocation()
    return ok(await db.from('shipments').insert(shipBody(req.body)).select(SHIP_SELECT).single())
  } catch (e) {
    throw shipErr(e)
  }
}))
app.put('/api/shipments/:id', wrap(async (req) => {
  try {
    await probeLocation()
    return ok(await db.from('shipments').update(shipBody(req.body)).eq('id', req.params.id).select(SHIP_SELECT).single())
  } catch (e) {
    throw shipErr(e)
  }
}))
app.delete('/api/shipments/:id', wrap(async (req) => {
  try {
    ok(await db.from('shipments').delete().eq('id', req.params.id))
  } catch (e) {
    throw shipErr(e)
  }
}))

// ---- Bản đồ: Google Maps Platform, khoá API chỉ nằm ở máy chủ ----
// Cần bật Geocoding API và Routes API cho khoá. Không có khoá thì vẫn tính được khoảng cách đường chim bay.
const haversineKm = (a, b) => {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const gmJson = async (url, init) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message || j.error_message || 'Lỗi Google Maps (' + r.status + ')')
  return j
}
const geoResults = (j) => {
  if (j.status === 'ZERO_RESULTS') return []
  if (j.status !== 'OK') throw new Error('Google Maps: ' + j.status + (j.error_message ? ' - ' + j.error_message : ''))
  return j.results.slice(0, 5).map((r) => ({ address: r.formatted_address, lat: r.geometry.location.lat, lng: r.geometry.location.lng }))
}
// Tìm địa chỉ / đường đi: dùng Google Maps Platform khi có khoá; chưa có khoá thì dùng OpenStreetMap (Nominatim + OSRM, miễn phí, không cần khoá)
const mapsProvider = () => (GOOGLE_MAPS_API_KEY ? 'google' : 'osm')
// Mỗi lần tìm địa chỉ / tính đường đi có thể tốn quota Google hoặc bị OpenStreetMap giới hạn
app.use('/api/maps', createLimiter({ max: 60, windowMs: 60e3 }))
// browserKey: khoá riêng cho trình duyệt (giới hạn theo tên miền) để hiện bản đồ Google; không có thì dùng bản đồ OpenStreetMap
app.get('/api/maps/status', wrap(async () => ({ enabled: !!GOOGLE_MAPS_API_KEY, provider: mapsProvider(), browserKey: GOOGLE_MAPS_BROWSER_KEY || null })))

// Nominatim yêu cầu tối đa 1 yêu cầu / giây và có User-Agent định danh ứng dụng
let nextOsm = 0
const osmJson = async (url) => {
  const start = Math.max(Date.now(), nextOsm)
  nextOsm = start + 1100
  if (start > Date.now()) await new Promise((r) => setTimeout(r, start - Date.now()))
  const r = await fetch(url, { headers: { 'User-Agent': 'debt-management-app/1.0', 'Accept-Language': 'vi' }, signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error('OpenStreetMap trả lỗi ' + r.status)
  return r.json()
}
// `bias` = { lat, lng }: ưu tiên kết quả quanh điểm này (khoảng ±0,6 độ ≈ 65 km) để "205 Bà Triệu" ra Huế chứ không phải nơi khác
const geocodeAddress = async (address, bias) => {
  const d = 0.6
  if (GOOGLE_MAPS_API_KEY) {
    const b = bias ? `&bounds=${bias.lat - d},${bias.lng - d}|${bias.lat + d},${bias.lng + d}` : ''
    return geoResults(await gmJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=vn&language=vi${b}&key=${GOOGLE_MAPS_API_KEY}`)).map((r) => ({ ...r, source: 'google' }))
  }
  const view = bias ? `&viewbox=${bias.lng - d},${bias.lat + d},${bias.lng + d},${bias.lat - d}&bounded=0` : ''
  // OpenStreetMap thiếu nhiều số nhà / hẻm: nếu không thấy thì bỏ dần phần đầu địa chỉ (số nhà, hẻm...) để tìm đến khu vực gần đúng
  const parts = address.split(',').map((x) => x.trim()).filter(Boolean)
  for (let i = 0; i < Math.max(1, parts.length); i++) {
    const q = parts.slice(i).join(', ')
    const list = await osmJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=vn&accept-language=vi${view}&q=${encodeURIComponent(q)}`)
    if (list.length) return list.map((r) => ({ address: r.display_name, lat: Number(r.lat), lng: Number(r.lon), source: 'osm', approx: i > 0 }))
  }
  return []
}
app.get('/api/maps/geocode', wrap(async (req) => {
  const address = String(req.query.address || '').trim()
  if (address.length < 3) throw new Error('Nhập địa chỉ (ít nhất 3 ký tự)')
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  return geocodeAddress(address, Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && req.query.lat != null && req.query.lat !== '' ? { lat, lng } : null)
}))
app.get('/api/maps/reverse', wrap(async (req) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw new Error('Toạ độ không hợp lệ')
  if (GOOGLE_MAPS_API_KEY) return geoResults(await gmJson(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=vi&key=${GOOGLE_MAPS_API_KEY}`))[0] || null
  const r = await osmJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=vi&lat=${lat}&lon=${lng}`)
  return r?.display_name ? { address: r.display_name, lat, lng } : null
}))

// Khoảng cách theo đường ô tô: Google Routes API, dự phòng OSRM, cuối cùng mới là đường chim bay
const routeGoogle = async (a, b) => {
  const point = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
  const j = await gmJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
    body: JSON.stringify({ origin: point(a), destination: point(b), travelMode: 'DRIVE', regionCode: 'VN', languageCode: 'vi' })
  })
  const r = j.routes?.[0]
  if (!r || r.distanceMeters == null) throw new Error('Google không tìm được đường đi')
  return { distance_km: Math.round(r.distanceMeters / 10) / 100, duration_min: Math.round(parseInt(r.duration, 10) / 60) || null, provider: 'google' }
}
const routeOsrm = async (a, b) => {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { headers: { 'User-Agent': 'debt-management-app/1.0' }, signal: AbortSignal.timeout(12000) })
  const j = await r.json().catch(() => ({}))
  const route = j.routes?.[0]
  if (!r.ok || j.code !== 'Ok' || !route) throw new Error('OSRM không tìm được đường đi')
  return { distance_km: Math.round(route.distance / 10) / 100, duration_min: Math.round(route.duration / 60) || null, provider: 'osrm' }
}
app.get('/api/maps/route', wrap(async (req) => {
  const [a, b] = ['from', 'to'].map((k) => ({ lat: Number(req.query[k + '_lat']), lng: Number(req.query[k + '_lng']) }))
  for (const p of [a, b]) if (!(Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)) throw new Error('Toạ độ không hợp lệ')
  const tries = [...(GOOGLE_MAPS_API_KEY ? [routeGoogle] : []), routeOsrm]
  const warnings = []
  for (const fn of tries) {
    try {
      return { ...(await fn(a, b)), method: 'road' }
    } catch (e) {
      warnings.push(e.message)
    }
  }
  return { distance_km: Math.round(haversineKm(a, b) * 100) / 100, duration_min: null, method: 'straight', warning: warnings.join('; ') }
}))
// Link rút gọn của Google Maps (maps.app.goo.gl...) -> link đầy đủ có toạ độ. Từng bước chuyển hướng đều được kiểm
// tên miền Google TRƯỚC khi gọi (lib/mapsGuard.js) để không bị lợi dụng gọi URL tuỳ ý.
app.get('/api/maps/resolve', wrap((req) => resolveMapsLink(req.query.url)))

// ---- Ảnh xác nhận giao hàng: Supabase Storage (bucket delivery-proofs, RIÊNG TƯ), thư mục = id chuyến xe ----
// Ảnh có thể chứa người và địa chỉ khách nên bucket không công khai: mỗi lần xem server cấp đường dẫn tạm (signed URL).
const PROOF_BUCKET = 'delivery-proofs'
const PROOF_URL_TTL = 60 * 60 // giây
bucketReady(PROOF_BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: IMAGE_TYPES })
const signedProofs = async (id, names) => {
  if (!names.length) return []
  const { data, error } = await db.storage.from(PROOF_BUCKET).createSignedUrls(names.map((n) => `${id}/${n}`), PROOF_URL_TTL)
  if (error) throw dbError(error)
  return names.map((name, i) => ({ name, url: data[i]?.signedUrl || null }))
}
app.get('/api/shipments/:id/proofs', wrap(async (req) => {
  needUuid(req.params.id, 'Mã chuyến không hợp lệ')
  const { data, error } = await db.storage.from(PROOF_BUCKET).list(req.params.id, { limit: 50, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw dbError(error)
  return signedProofs(req.params.id, data.filter((f) => f.id).map((f) => f.name))
}))
app.post('/api/shipments/:id/proofs', wrap(async (req) => {
  needUuid(req.params.id, 'Mã chuyến không hợp lệ')
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data || ''))
  if (!m) throw new Error('Ảnh không hợp lệ (chỉ JPEG, PNG hoặc WebP)')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 2 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 2MB)')
  ok(await db.from('shipments').select('id').eq('id', req.params.id).single())
  // Số ngẫu nhiên đi kèm thời gian: hai ảnh tải lên cùng một mili giây không đè nhau
  const name = `${Date.now()}${crypto.randomInt(100, 1000)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
  const { error } = await db.storage.from(PROOF_BUCKET).upload(`${req.params.id}/${name}`, buf, { contentType: 'image/' + m[1], cacheControl: '3600' })
  if (error) throw dbError(error)
  return (await signedProofs(req.params.id, [name]))[0]
}))
app.delete('/api/shipments/:id/proofs/:name', wrap(async (req) => {
  needUuid(req.params.id, 'Tham số không hợp lệ')
  if (!/^[0-9]+\.(jpg|png|webp)$/.test(req.params.name)) throw new Error('Tham số không hợp lệ')
  const { error } = await db.storage.from(PROOF_BUCKET).remove([`${req.params.id}/${req.params.name}`])
  if (error) throw dbError(error)
}))

// ---- Xuất Excel theo kỳ: mỗi khách hàng một sheet, bố cục giống file "Công nợ 2026.xlsx" ----
// Mỗi tháng là một khối: dòng tiêu đề, các dòng hàng, dòng TỔNG. Dòng hàng đầu tiên của tháng mang số liệu công nợ
// (Nợ đầu kỳ, PS trong kỳ, Thu+VC, Cuối kỳ). Sheet "Tổng hợp" ở đầu liệt kê công nợ mọi khách trong kỳ.
const XLSX_HEAD = ['Số lượng', 'Sản phẩm', 'Giá', 'VC ngoài', 'Đã thu', 'Thành tiền', 'Xe', 'Nợ đầu kỳ', 'PS trong kỳ', 'Thu+VC', 'Cuối kỳ']
const GOLD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } }
const NUM_FMT = '#,##0'
const sheetName = (name, used) => {
  const base = String(name || 'Khách hàng').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Khách hàng'
  let n = base
  let i = 2
  while (used.has(n.toLowerCase())) {
    const suf = ' ' + i++
    n = base.slice(0, 31 - suf.length) + suf
  }
  used.add(n.toLowerCase())
  return n
}
const dmy =(d) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`
const monthsBetween = (from, to) => {
  const out = []
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  const endKey = to.slice(0, 7)
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (key > endKey) break
    const first = `${key}-01`
    const last = addDay(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`, -1)
    out.push({ key, m, start: first < from ? from : first, end: last > to ? to : last })
    if (m === 12) (y++, (m = 1))
    else m++
  }
  return out
}
const isOpening = (o) => /^Nợ đầu kỳ/i.test(o.note || '')

app.get('/api/export/excel', async (req, res) => {
  try {
    const p = period(req.query)
    const [orders, items, pays, ships] = await Promise.all([
      fetchAll(() => db.from('order_summary').select('id, code, partner_id, partner_name, total, order_date, note').eq('type', 'out').order('id')),
      fetchAll(() => db.from('order_items').select('order_id, qty, price, products(name)').order('id')),
      fetchAll(() => db.from('payments').select('amount, paid_at, orders!inner(partner_id, type)').eq('orders.type', 'out').order('id')),
      (async () => {
        try {
          return await fetchAll(() => db.from('shipments').select('order_id, vehicle').order('id'))
        } catch {
          return []
        }
      })()
    ])
    const itemsBy = new Map()
    for (const i of items) itemsBy.set(i.order_id, [...(itemsBy.get(i.order_id) || []), i])
    const vehBy = new Map()
    for (const s of ships) if (s.vehicle) vehBy.set(s.order_id, [...new Set([...(vehBy.get(s.order_id) || []), s.vehicle])])
    const xeOf = (o) => (vehBy.get(o.id) || []).join(', ') || String(o.note || '').replace(/^Xe\s+/i, '') || ''

    const dates = [...orders.map((o) => o.order_date), ...pays.map((x) => x.paid_at)].sort()
    if (!dates.length) throw new Error('Chưa có dữ liệu để xuất')
    // Kỳ lọc chưa có đầu / cuối thì lấy theo dữ liệu thật; không để vòng lặp tháng chạy từ năm 1
    const from = p && p.from > dates[0] ? p.from : dates[0]
    const lastDate = dates.at(-1)
    const to = p && addDay(p.to, -1) < lastDate ? addDay(p.to, -1) : lastDate
    if (from > to) throw new Error('Khoảng ngày không có dữ liệu')
    const months = monthsBetween(from, to)

    // Gom theo khách
    const cust = new Map()
    const get = (id, name) => {
      if (!cust.has(id)) cust.set(id, { id, name, orders: [], pays: [] })
      return cust.get(id)
    }
    for (const o of orders) get(o.partner_id, o.partner_name).orders.push(o)
    for (const x of pays) get(x.orders.partner_id, '').pays.push(x)
    // Số dư (nợ) trước ngày d. Khoản "Nợ đầu kỳ" tính như phát sinh từ trước ngày ghi
    const eff = (o) => (isOpening(o) ? addDay(o.order_date, -1) : o.order_date)
    const balBefore = (c, d) => c.orders.filter((o) => eff(o) < d).reduce((s, o) => s + Number(o.total), 0) - c.pays.filter((x) => x.paid_at < d).reduce((s, x) => s + Number(x.amount), 0)

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Quản lý công nợ'
    const summary = wb.addWorksheet('Tổng hợp')
    const used = new Set(['tổng hợp'])
    const rowsSummary = []
    const sorted = [...cust.values()].filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name, 'vi'))

    for (const c of sorted) {
      // Nợ đầu kỳ của cả kỳ: số dư trước kỳ + các khoản "Nợ đầu kỳ" được ghi giữa kỳ (khách bắt đầu theo dõi muộn hơn)
      const open0 = balBefore(c, from) + c.orders.filter((o) => isOpening(o) && o.order_date > from && o.order_date <= to).reduce((s, o) => s + Number(o.total), 0)
      let psAll = 0
      let thuAll = 0
      const blocks = []
      for (const mo of months) {
        const mOrders = c.orders.filter((o) => !isOpening(o) && o.order_date >= mo.start && o.order_date <= mo.end).sort((a, b) => a.order_date.localeCompare(b.order_date) || a.code.localeCompare(b.code))
        const lines = []
        for (const o of mOrders) {
          const its = itemsBy.get(o.id) || []
          if (!its.length) {
            lines.push({ date: o.order_date, qty: null, name: o.note || 'Điều chỉnh công nợ', price: null, vc: 0, xe: '', amount: Number(o.total) })
            continue
          }
          const gross = its.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0)
          const diff = Number(o.total) - gross // phí vận chuyển ngoài hoặc chênh lệch do sửa đơn
          its.forEach((i, k) => lines.push({ date: o.order_date, qty: Number(i.qty), name: i.products?.name || '', price: Number(i.price), vc: k === 0 && Math.abs(diff) > 0.5 ? diff : 0, xe: k === 0 ? xeOf(o) : '', amount: 0 }))
        }
        const thu = c.pays.filter((x) => x.paid_at >= mo.start && x.paid_at <= mo.end).reduce((s, x) => s + Number(x.amount), 0)
        if (!lines.length && !thu) continue
        blocks.push({ mo, lines, thu, open: balBefore(c, mo.start) })
      }
      if (!blocks.length) {
        if (Math.abs(open0) > 0.5) rowsSummary.push({ name: c.name, open: open0, ps: 0, thu: 0 })
        continue
      }
      const ws = wb.addWorksheet(sheetName(c.name, used))
      ws.columns = [{ width: 10 }, { width: 10 }, { width: 18 }, { width: 13 }, { width: 11 }, { width: 13 }, { width: 15 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }]
      for (const b of blocks) {
        const head = ws.addRow([`Tháng ${b.mo.m}`, ...XLSX_HEAD])
        head.eachCell((cell) => {
          cell.font = { bold: true }
          cell.fill = GOLD
        })
        const first = head.number + 1
        const rows = b.lines.length ? b.lines : [null]
        let ps = 0
        rows.forEach((ln, k) => {
          const r = ws.addRow([])
          const n = r.number
          if (ln) {
            const amount = ln.price == null ? ln.amount : ln.qty * ln.price + ln.vc
            ps += amount
            r.getCell(1).value = dmy(ln.date)
            if (ln.qty != null) r.getCell(2).value = ln.qty
            r.getCell(3).value = ln.name
            if (ln.price != null) r.getCell(4).value = ln.price
            if (ln.vc) r.getCell(5).value = ln.vc
            r.getCell(7).value = ln.price == null ? amount : { formula: `(B${n}*D${n})+E${n}-F${n}`, result: amount }
            r.getCell(8).value = ln.xe
          }
          if (k === 0) r.getCell(9).value = b.open // Nợ đầu kỳ
          r.eachCell({ includeEmpty: true }, (cell, col) => {
            if (col >= 4) cell.numFmt = NUM_FMT
          })
        })
        const last = ws.lastRow.number
        const r1 = ws.getRow(first)
        r1.getCell(10).value = { formula: `SUM(G${first}:G${last})`, result: ps }
        r1.getCell(11).value = b.thu
        r1.getCell(12).value = { formula: `(I${first}+J${first})-K${first}`, result: b.open + ps - b.thu }
        for (const col of [9, 10, 11, 12]) r1.getCell(col).numFmt = NUM_FMT
        const total = ws.addRow(['TỔNG'])
        ws.mergeCells(`A${total.number}:F${total.number}`)
        total.getCell(7).value = { formula: `SUM(G${first}:G${last})`, result: ps }
        total.getCell(7).numFmt = NUM_FMT
        total.font = { bold: true }
        ws.addRow([])
        ws.addRow([])
        psAll += ps
        thuAll += b.thu
      }
      rowsSummary.push({ name: c.name, open: open0, ps: psAll, thu: thuAll })
    }

    // Sheet tổng hợp
    summary.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }]
    const sh = summary.addRow(['Khách hàng', 'Nợ đầu kỳ', 'PS trong kỳ', 'Thu+VC', 'Cuối kỳ'])
    sh.eachCell((cell) => {
      cell.font = { bold: true }
      cell.fill = GOLD
    })
    rowsSummary.sort((a, b) => b.open + b.ps - b.thu - (a.open + a.ps - a.thu))
    for (const r of rowsSummary) {
      const row = summary.addRow([r.name, r.open, r.ps, r.thu, null])
      row.getCell(5).value = { formula: `(B${row.number}+C${row.number})-D${row.number}`, result: r.open + r.ps - r.thu }
      for (const col of [2, 3, 4, 5]) row.getCell(col).numFmt = NUM_FMT
    }
    const n1 = 2
    const n2 = summary.lastRow.number
    const tr = summary.addRow(['TỔNG'])
    for (const [col, letter, key] of [[2, 'B', 'open'], [3, 'C', 'ps'], [4, 'D', 'thu']]) {
      tr.getCell(col).value = { formula: `SUM(${letter}${n1}:${letter}${n2})`, result: rowsSummary.reduce((s, r) => s + r[key], 0) }
      tr.getCell(col).numFmt = NUM_FMT
    }
    tr.getCell(5).value = { formula: `(B${tr.number}+C${tr.number})-D${tr.number}`, result: rowsSummary.reduce((s, r) => s + r.open + r.ps - r.thu, 0) }
    tr.getCell(5).numFmt = NUM_FMT
    tr.font = { bold: true }
    summary.views = [{ state: 'frozen', ySplit: 1 }]

    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="cong-no_${from}_${to}.xlsx"`)
    res.send(Buffer.from(buf))
  } catch (e) {
    sendError(req, res, e)
  }
})

// ---- Công nợ theo đối tác (tổng hợp trong DB: hàm SQL debts_by_partner) ----
const periodArgs = (per) => ({ p_from: per ? per.from : null, p_to: per ? per.to : null })
app.get('/api/debts', wrap(async (req) => {
  const rows = await rpc('debts_by_partner', periodArgs(period(req.query)))
  return rows.map((r) => ({ ...r, debt: Number(r.debt), orders: Number(r.orders) }))
}))
// ---- Thu chi: khoản thu khác / chi (bảng cashflow). Khoản thu từ khách lấy từ bảng thanh toán ----
const CASH_KINDS = ['in', 'out']
const cashErr = (e) =>
  /cashflow/.test(e.message || '') && /(does not exist|schema cache)/.test(e.message || '')
    ? new Error('Chưa tạo bảng thu chi: chạy supabase/003_cashflow.sql trong Supabase SQL Editor')
    : e
const cashBody = (b) => {
  if (!CASH_KINDS.includes(b.kind)) throw new Error('Chọn thu hoặc chi')
  const amount = Number(b.amount)
  if (!(amount > 0)) throw new Error('Số tiền không hợp lệ')
  return { kind: b.kind, amount, entry_date: b.entry_date || undefined, category: String(b.category || '').trim() || null, note: String(b.note || '').trim() || null }
}
app.post('/api/cashflow', wrap(async (req) => {
  try {
    return ok(await db.from('cashflow').insert(cashBody(req.body)).select().single())
  } catch (e) {
    throw cashErr(e)
  }
}))
app.put('/api/cashflow/:id', wrap(async (req) => {
  try {
    return ok(await db.from('cashflow').update(cashBody(req.body)).eq('id', req.params.id).select().single())
  } catch (e) {
    throw cashErr(e)
  }
}))
app.delete('/api/cashflow/:id', wrap(async (req) => {
  try {
    ok(await db.from('cashflow').delete().eq('id', req.params.id))
  } catch (e) {
    throw cashErr(e)
  }
}))
// Sổ thu chi theo kỳ: thanh toán của khách (thu) + khoản thu khác + chi, mới nhất trước
app.get('/api/ledger', wrap(async (req) => {
  const per = period(req.query)
  const pays = await fetchAll(() => inPeriod(db.from('payments').select('id, amount, paid_at, note, orders(id, code, partner_id, partners(name))').order('id'), per, 'paid_at'))
  let cash = []
  let cashReady = true
  try {
    cash = await fetchAll(() => inPeriod(db.from('cashflow').select('*').order('id'), per, 'entry_date'))
  } catch (e) {
    if (!cashErr(e) || cashErr(e) === e) throw e
    cashReady = false
  }
  const items = [
    ...pays.map((p) => ({ id: p.id, source: 'payment', kind: 'in', date: p.paid_at, amount: Number(p.amount), title: p.orders?.partners?.name || 'Khách hàng', sub: p.orders?.code || '', note: p.note, order_id: p.orders?.id, partner_id: p.orders?.partner_id })),
    ...cash.map((c) => ({ id: c.id, source: 'cashflow', kind: c.kind, date: c.entry_date, amount: Number(c.amount), title: c.category || (c.kind === 'in' ? 'Thu khác' : 'Chi'), sub: '', note: c.note, category: c.category }))
  ].sort((a, b) => b.date.localeCompare(a.date))
  const sum = (k) => items.filter((i) => i.kind === k).reduce((s, i) => s + i.amount, 0)
  return { items, totals: { in: sum('in'), out: sum('out'), balance: sum('in') - sum('out') }, cashflow_ready: cashReady }
}))

// ---- Tổng quan: số liệu + dữ liệu vẽ biểu đồ theo kỳ (tổng hợp trong DB: hàm SQL dashboard_data) ----
app.get('/api/dashboard', wrap(async (req) => rpc('dashboard_data', periodArgs(period(req.query)))))

app.use('/api', (_q, r) => r.status(404).json({ error: 'Không tìm thấy' }))
// Giao diện React đã build (`npm run build` -> dist). File trong /assets có hash nên cache lâu; index.html thì không cache.
const dist = path.join(__dirname, 'dist')
if (fs.existsSync(dist)) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true }))
  app.use(express.static(dist, { maxAge: 0 }))
  app.get('*', (_q, r) => r.sendFile(path.join(dist, 'index.html')))
} else {
  app.get('*', (_q, r) => r.status(503).send('Chưa build giao diện: chạy `npm run build`'))
}

// Lỗi chưa bắt được (ví dụ mạng tới Supabase đứt giữa chừng): ghi log, không làm sập cả tiến trình
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e))
app.use((e, req, res, _next) => sendError(req, res, e)) // lỗi đồng bộ trong middleware (ví dụ JSON sai cú pháp)

const server = app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`))
// Nhận SIGTERM / SIGINT (deploy, dừng container): ngừng nhận kết nối mới, chờ các yêu cầu đang chạy xong rồi thoát
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`Nhận ${sig}, đang tắt server...`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10000).unref()
  })
}
