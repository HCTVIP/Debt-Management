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

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_PASSWORD, TOKEN_SECRET, PORT = 3000 } = process.env
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_PASSWORD, TOKEN_SECRET })) {
  if (!v) {
    console.error(`Thiếu biến môi trường ${k}`)
    process.exit(1)
  }
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } })
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } } }))
app.use(compression())
app.use(express.json({ limit: '200kb' }))

// ---- Auth: token = payload.hmac, hạn 7 ngày ----
const sign = (s) => crypto.createHmac('sha256', TOKEN_SECRET).update(s).digest('base64url')
const makeToken = () => {
  const p = Buffer.from(JSON.stringify({ exp: Date.now() + 7 * 864e5 })).toString('base64url')
  return `${p}.${sign(p)}`
}
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
const verify = (t = '') => {
  const [p, sig] = t.split('.')
  if (!p || !sig || !safeEq(sig, sign(p))) return false
  try {
    return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now()
  } catch {
    return false
  }
}
const auth = (req, res, next) =>
  verify((req.headers.authorization || '').replace('Bearer ', '')) ? next() : res.status(401).json({ error: 'Chưa đăng nhập' })

const fails = new Map()
app.post('/api/login', (req, res) => {
  const ip = req.ip
  const f = fails.get(ip) || { n: 0, t: Date.now() }
  if (Date.now() - f.t > 15 * 60e3) Object.assign(f, { n: 0, t: Date.now() })
  if (f.n >= 10) return res.status(429).json({ error: 'Thử lại sau 15 phút' })
  const pw = String(req.body?.password ?? '')
  const h = (x) => crypto.createHash('sha256').update(x).digest('hex')
  if (!safeEq(h(pw), h(APP_PASSWORD))) {
    fails.set(ip, { ...f, n: f.n + 1 })
    return res.status(401).json({ error: 'Sai mật khẩu' })
  }
  fails.delete(ip)
  res.json({ token: makeToken() })
})

app.get('/healthz', (_q, r) => r.send('ok'))
app.use('/api', auth)

const wrap = (fn) => async (req, res) => {
  try {
    const data = await fn(req)
    res.json(data ?? { ok: true })
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || 'Lỗi' })
  }
}
const ok = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
const need = (v, msg) => {
  if (v === undefined || v === null || String(v).trim() === '') throw new Error(msg)
}

// ---- CRUD đối tác / hàng hóa ----
const crud = (route, table, fields, order, validate) => {
  app.get(`/api/${route}`, wrap(async (req) => {
    let q = db.from(table).select('*').order(order, { ascending: order === 'name' })
    if (req.query.type) q = q.eq('type', req.query.type)
    const rows = ok(await q)
    // ?debt=1: kèm tổng nợ còn lại của từng đối tác
    if (route === 'partners' && req.query.debt === '1') {
      const os = await fetchAll(() => db.from('order_summary').select('partner_id, debt').gt('debt', 0).order('code'))
      const d = new Map()
      for (const o of os) d.set(o.partner_id, (d.get(o.partner_id) || 0) + Number(o.debt))
      for (const r of rows) r.debt = d.get(r.id) || 0
    }
    return rows
  }))
  app.get(`/api/${route}/:id`, wrap(async (req) => ok(await db.from(table).select('*').eq('id', req.params.id).single())))
  app.post(`/api/${route}`, wrap(async (req) => {
    const b = pick(req.body, fields)
    validate(b)
    return ok(await db.from(table).insert(b).select().single())
  }))
  app.put(`/api/${route}/:id`, wrap(async (req) => {
    const b = pick(req.body, fields)
    validate(b)
    return ok(await db.from(table).update(b).eq('id', req.params.id).select().single())
  }))
  app.delete(`/api/${route}/:id`, wrap(async (req) => {
    const { error } = await db.from(table).delete().eq('id', req.params.id)
    if (error) throw new Error(error.code === '23503' ? 'Đã có đơn hàng liên quan, không thể xoá' : error.message)
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
})

// ---- Lọc theo kỳ: month=YYYY-MM hoặc year=YYYY (bỏ trống = tất cả) ----
const period = (query) => {
  const { month, year, from, to } = query
  if (from || to) {
    const okDate = (d) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'))
    if ((from && !okDate(from)) || (to && !okDate(to))) throw new Error('Ngày không hợp lệ')
    if (from && to && from > to) throw new Error('Từ ngày phải trước đến ngày')
    // "đến ngày" tính cả ngày đó
    const next = to ? new Date(Date.parse(to + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10) : '9999-12-31'
    return { from: from || '0001-01-01', to: next }
  }
  if (month) {
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Tháng không hợp lệ')
    const [y, m] = month.split('-').map(Number)
    const ny = m === 12 ? y + 1 : y
    const nm = m === 12 ? 1 : m + 1
    return { from: `${month}-01`, to: `${ny}-${String(nm).padStart(2, '0')}-01` }
  }
  if (year) {
    if (!/^[0-9]{4}$/.test(year)) throw new Error('Năm không hợp lệ')
    return { from: `${year}-01-01`, to: `${Number(year) + 1}-01-01` }
  }
  return null
}
const inPeriod = (q, p, col = 'order_date') => (p ? q.gte(col, p.from).lt(col, p.to) : q)
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
    let q = db.from('order_summary').select('*').order('order_date', { ascending: false }).order('code', { ascending: false })
    if (req.query.type) q = q.eq('type', req.query.type)
    if (req.query.partner_id) q = q.eq('partner_id', req.query.partner_id)
    if (req.query.open === '1') q = q.gt('debt', 0)
    const text = String(req.query.q || '').replace(/[,()%*\\]/g, ' ').trim()
    if (text) q = q.or(`code.ilike.%${text}%,partner_name.ilike.%${text}%`)
    return inPeriod(q, p)
  })
}))
app.get('/api/orders/:id', wrap(async (req) => {
  const id = req.params.id
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
  const items = (b.items || []).map((i) => ({ product_id: i.product_id, qty: Number(i.qty), price: Number(i.price) }))
  if (!items.length || items.some((i) => !i.product_id || !(i.qty > 0) || !(i.price >= 0))) throw new Error('Mặt hàng không hợp lệ')
  const id = ok(await db.rpc('create_order', { p: { ...pick(b, ['type', 'partner_id', 'order_date', 'note']), paid: Number(b.paid) || 0, items } }))
  return { id }
}))
// Sửa đơn: đơn có mặt hàng thì thay toàn bộ mặt hàng (tồn kho điều chỉnh theo chênh lệch);
// đơn không có mặt hàng (nợ đầu kỳ / điều chỉnh) thì sửa trực tiếp tổng tiền.
// Lưu ý: không nằm trong 1 transaction, thêm mặt hàng mới trước rồi mới xoá mặt hàng cũ để không mất dữ liệu nếu lỗi giữa chừng.
app.put('/api/orders/:id', wrap(async (req) => {
  const id = req.params.id
  const b = req.body
  need(b.partner_id, 'Chọn đối tác')
  const old = ok(await db.from('order_summary').select('*').eq('id', id).single())
  const partner = ok(await db.from('partners').select('type').eq('id', b.partner_id).single())
  if (partner.type !== (old.type === 'in' ? 'supplier' : 'customer')) throw new Error('Đối tác không đúng loại của đơn')
  const oldItems = ok(await db.from('order_items').select('id, product_id, qty').eq('order_id', id))
  const upd = { partner_id: b.partner_id, order_date: b.order_date || old.order_date, note: b.note || null }
  let newItems = null
  if (oldItems.length) {
    newItems = (b.items || []).map((i) => ({ order_id: id, product_id: i.product_id, qty: Number(i.qty), price: Number(i.price) }))
    if (!newItems.length || newItems.some((i) => !i.product_id || !(i.qty > 0) || !(i.price >= 0))) throw new Error('Mặt hàng không hợp lệ')
    upd.total = newItems.reduce((s, i) => s + i.qty * i.price, 0)
  } else {
    upd.total = Number(b.total)
    if (!(upd.total >= 0)) throw new Error('Tổng tiền không hợp lệ')
  }
  if (upd.total + 0.5 < Number(old.paid)) throw new Error('Tổng đơn nhỏ hơn số tiền đã thanh toán, hãy sửa thanh toán trước')
  if (newItems) {
    ok(await db.from('order_items').insert(newItems))
    ok(await db.from('order_items').delete().in('id', oldItems.map((i) => i.id)))
    const sign = old.type === 'in' ? 1 : -1
    const delta = new Map()
    for (const i of newItems) delta.set(i.product_id, (delta.get(i.product_id) || 0) + sign * i.qty)
    for (const i of oldItems) delta.set(i.product_id, (delta.get(i.product_id) || 0) - sign * Number(i.qty))
    for (const [pid, d] of delta) {
      if (!d) continue
      const pr = ok(await db.from('products').select('stock').eq('id', pid).single())
      ok(await db.from('products').update({ stock: Number(pr.stock) + d }).eq('id', pid))
    }
  }
  ok(await db.from('orders').update(upd).eq('id', id))
  return { id }
}))
app.put('/api/payments/:id', wrap(async (req) => {
  const pay = ok(await db.from('payments').select('*').eq('id', req.params.id).single())
  const amount = Number(req.body.amount)
  if (!(amount > 0)) throw new Error('Số tiền không hợp lệ')
  const o = ok(await db.from('order_summary').select('total, paid').eq('id', pay.order_id).single())
  if (Number(o.paid) - Number(pay.amount) + amount > Number(o.total) + 0.5) throw new Error('Số tiền vượt tổng đơn')
  return ok(await db.from('payments').update({ amount, paid_at: req.body.paid_at || pay.paid_at, note: req.body.note || null }).eq('id', pay.id).select().single())
}))
app.delete('/api/orders/:id', wrap(async (req) => {
  ok(await db.rpc('delete_order', { oid: req.params.id }))
}))
app.post('/api/orders/:id/payments', wrap(async (req) => {
  const amount = Number(req.body.amount)
  if (!(amount > 0)) throw new Error('Số tiền không hợp lệ')
  const o = ok(await db.from('order_summary').select('debt').eq('id', req.params.id).single())
  if (amount > Number(o.debt)) throw new Error('Số tiền vượt công nợ còn lại')
  return ok(await db.from('payments').insert({ order_id: req.params.id, amount, paid_at: req.body.paid_at || undefined, note: req.body.note }).select().single())
}))
app.delete('/api/payments/:id', wrap(async (req) => {
  ok(await db.from('payments').delete().eq('id', req.params.id))
}))

// ---- Vận chuyển: mỗi chuyến thuộc về một đơn hàng (đơn hàng là khoá chính) ----
const SHIP_STATUS = ['pending', 'shipping', 'delivered']
const shipErr = (e) =>
  /shipments/.test(e.message || '') && /(does not exist|schema cache)/.test(e.message || '')
    ? new Error('Chưa tạo bảng vận chuyển: chạy supabase/002_shipments.sql trong Supabase SQL Editor')
    : e
const shipBody = (b) => {
  need(b.order_id, 'Chọn đơn hàng')
  const fee = b.fee === '' || b.fee == null ? 0 : Number(b.fee)
  if (!(fee >= 0)) throw new Error('Cước phí không hợp lệ')
  const status = b.status || 'pending'
  if (!SHIP_STATUS.includes(status)) throw new Error('Trạng thái không hợp lệ')
  return { order_id: b.order_id, ship_date: b.ship_date || undefined, vehicle: String(b.vehicle || '').trim() || null, driver: String(b.driver || '').trim() || null, fee, status, note: String(b.note || '').trim() || null }
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
    return ok(await db.from('shipments').insert(shipBody(req.body)).select(SHIP_SELECT).single())
  } catch (e) {
    throw shipErr(e)
  }
}))
app.put('/api/shipments/:id', wrap(async (req) => {
  try {
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

// ---- Công nợ theo đối tác + tổng quan ----
app.get('/api/debts', wrap(async (req) => {
  const p = period(req.query)
  const rows = await fetchAll(() => inPeriod(db.from('order_summary').select('partner_id, partner_name, type, debt').gt('debt', 0).order('partner_id').order('code'), p))
  const m = new Map()
  for (const r of rows) {
    const k = `${r.partner_id}`
    const x = m.get(k) || { partner_id: r.partner_id, partner_name: r.partner_name, type: r.type, debt: 0, orders: 0 }
    x.debt += Number(r.debt)
    x.orders++
    m.set(k, x)
  }
  return [...m.values()].sort((a, b) => b.debt - a.debt)
}))
app.get('/api/dashboard', wrap(async (req) => {
  const per = period(req.query)
  const [o, pays, prods] = await Promise.all([
    fetchAll(() => inPeriod(db.from('order_summary').select('type, total, debt').order('code'), per)),
    fetchAll(() => inPeriod(db.from('payments').select('amount, orders!inner(type)').order('id'), per, 'paid_at')),
    db.from('products').select('id, name, unit, stock, min_stock, cost_price')
  ])
  const p = ok(prods)
  const by = (t, f) => o.filter((x) => x.type === t).reduce((s, x) => s + Number(x[f]), 0)
  const paid = (t) => pays.filter((x) => x.orders?.type === t).reduce((s, x) => s + Number(x.amount), 0)
  return {
    payable: by('in', 'debt'),
    receivable: by('out', 'debt'),
    purchased: by('in', 'total'),
    sold: by('out', 'total'),
    collected: paid('out'),
    paid_out: paid('in'),
    stock_value: p.reduce((s, x) => s + Number(x.stock) * Number(x.cost_price), 0),
    low_stock: p.filter((x) => Number(x.stock) <= Number(x.min_stock))
  }
}))

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

app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`))
