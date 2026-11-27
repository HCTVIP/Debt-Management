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
    return ok(await q)
  }))
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

// ---- Đơn hàng ----
app.get('/api/orders', wrap(async (req) => {
  let q = db.from('order_summary').select('*').order('created_at', { ascending: false }).limit(200)
  if (req.query.type) q = q.eq('type', req.query.type)
  if (req.query.open === '1') q = q.gt('debt', 0)
  return ok(await q)
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

// ---- Công nợ theo đối tác + tổng quan ----
app.get('/api/debts', wrap(async () => {
  const rows = ok(await db.from('order_summary').select('partner_id, partner_name, type, debt').gt('debt', 0))
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
app.get('/api/dashboard', wrap(async () => {
  const [sum, prods] = await Promise.all([
    db.from('order_summary').select('type, total, debt'),
    db.from('products').select('id, name, unit, stock, min_stock, cost_price')
  ])
  const o = ok(sum)
  const p = ok(prods)
  const by = (t, f) => o.filter((x) => x.type === t).reduce((s, x) => s + Number(x[f]), 0)
  return {
    payable: by('in', 'debt'),
    receivable: by('out', 'debt'),
    purchased: by('in', 'total'),
    sold: by('out', 'total'),
    stock_value: p.reduce((s, x) => s + Number(x.stock) * Number(x.cost_price), 0),
    low_stock: p.filter((x) => Number(x.stock) <= Number(x.min_stock))
  }
}))

app.use('/api', (_q, r) => r.status(404).json({ error: 'Không tìm thấy' }))
const dist = path.join(__dirname, fs.existsSync(path.join(__dirname, 'dist')) ? 'dist' : 'public')
app.use(express.static(dist, { maxAge: '1h' }))
app.get('*', (_q, r) => r.sendFile(path.join(dist, 'index.html')))

app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`))
