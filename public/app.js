const $app = document.getElementById('app')
const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫'
const num = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(n) || 0)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const dt = (d) => (d ? d.split('-').reverse().join('/') : '---')
const today = () => new Date().toISOString().slice(0, 10)

let token = localStorage.getItem('token')
const state = { tab: 'home', ordType: 'in', ptype: 'supplier', partners: [], products: [] }

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401 && path !== '/login') logout()
  if (!r.ok) throw new Error(j.error || 'Lỗi hệ thống')
  return j
}
function logout() {
  localStorage.removeItem('token')
  token = null
  render()
}
function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg })
  document.body.append(t)
  setTimeout(() => t.remove(), 2500)
}
const guard = (fn) => async (...a) => {
  try {
    await fn(...a)
  } catch (e) {
    toast(e.message)
  }
}

function sheet(html, onMount) {
  const bg = document.createElement('div')
  bg.className = 'sheet-bg'
  bg.innerHTML = `<div class="sheet">${html}</div>`
  bg.addEventListener('click', (e) => e.target === bg && bg.remove())
  document.body.append(bg)
  onMount?.(bg.firstElementChild, () => bg.remove())
}
const $ = (el, sel) => el.querySelector(sel)

// ---------- Đăng nhập ----------
function loginView() {
  $app.innerHTML = `<form class="login"><h1>Quản lý tài chính</h1><label>Mật khẩu</label>
    <input type="password" name="pw" autocomplete="current-password" required /><button class="btn" style="width:100%">Đăng nhập</button></form>`
  $app.firstElementChild.onsubmit = guard(async (e) => {
    e.preventDefault()
    const r = await api('/login', 'POST', { password: e.target.pw.value })
    token = r.token
    localStorage.setItem('token', token)
    render()
  })
}

// ---------- Khung ----------
const TABS = [
  ['home', '📊', 'Tổng quan'],
  ['orders', '🧾', 'Đơn hàng'],
  ['debts', '💰', 'Công nợ'],
  ['products', '📦', 'Hàng hóa'],
  ['partners', '👥', 'Đối tác']
]
function render() {
  if (!token) return loginView()
  $app.innerHTML = `<header class="top"><h1>${TABS.find((t) => t[0] === state.tab)[2]}</h1><button class="btn sec sm" id="lo">Thoát</button></header>
    <main id="main"></main><nav class="tabs">${TABS.map(([k, i, l]) => `<button data-t="${k}" class="${k === state.tab ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>`
  $($app, '#lo').onclick = logout
  $app.querySelectorAll('nav button').forEach((b) => (b.onclick = () => ((state.tab = b.dataset.t), render())))
  views[state.tab](document.getElementById('main'))
}
const fab = (main, onClick) => {
  const b = Object.assign(document.createElement('button'), { className: 'fab', textContent: '+' })
  b.onclick = onClick
  main.append(b)
}
const load = (main, fn) => fn(main).catch((e) => (main.innerHTML = `<div class="empty red">${esc(e.message)}</div>`))

// ---------- Màn hình ----------
const views = {
  home: (main) =>
    load(main, async () => {
      const d = await api('/dashboard')
      main.innerHTML = `<div class="grid2">
        <div class="card stat"><small>Phải trả NCC</small><b class="red">${money(d.payable)}</b></div>
        <div class="card stat"><small>Khách nợ</small><b class="grn">${money(d.receivable)}</b></div>
        <div class="card stat"><small>Tổng nhập</small><b>${money(d.purchased)}</b></div>
        <div class="card stat"><small>Tổng bán</small><b>${money(d.sold)}</b></div></div>
        <div class="card stat"><small>Giá trị tồn kho (theo giá vốn)</small><b>${money(d.stock_value)}</b></div>
        <h3>Sắp hết hàng</h3>${d.low_stock.length ? d.low_stock.map((p) => `<div class="item row"><span>${esc(p.name)}</span><span class="badge warn">${num(p.stock)} ${esc(p.unit)}</span></div>`).join('') : '<div class="empty">Không có</div>'}`
    }),

  orders: (main) =>
    load(main, async () => {
      const list = await api('/orders?type=' + state.ordType)
      main.innerHTML = `<div class="seg"><button data-t="in" class="${state.ordType === 'in' ? 'on' : ''}">Nhập hàng</button><button data-t="out" class="${state.ordType === 'out' ? 'on' : ''}">Bán hàng</button></div>
        ${list.length ? list.map((o) => `<div class="item" data-id="${o.id}"><div class="row"><span class="t">${esc(o.partner_name)}</span><b>${money(o.total)}</b></div>
          <div class="row mut"><span>${esc(o.code)} · ${dt(o.order_date)}</span>${Number(o.debt) > 0 ? `<span class="red">Nợ ${money(o.debt)}</span>` : '<span class="grn">Đã thanh toán</span>'}</div></div>`).join('') : '<div class="empty">Chưa có đơn</div>'}`
      main.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => ((state.ordType = b.dataset.t), render())))
      main.querySelectorAll('.item').forEach((el) => (el.onclick = () => orderDetail(el.dataset.id)))
      fab(main, guard(() => orderForm()))
    }),

  debts: (main) =>
    load(main, async () => {
      const [debts, open] = await Promise.all([api('/debts'), api('/orders?open=1')])
      const grp = (type, title, cls) => {
        const rows = debts.filter((d) => d.type === type)
        return `<h3>${title} <span class="${cls}">${money(rows.reduce((s, r) => s + r.debt, 0))}</span></h3>${
          rows.length ? rows.map((r) => `<div class="item" data-p="${r.partner_id}"><div class="row"><span class="t">${esc(r.partner_name)}</span><b class="${cls}">${money(r.debt)}</b></div><small class="mut">${r.orders} đơn chưa thanh toán xong</small></div>`).join('') : '<div class="empty">Không có công nợ</div>'}`
      }
      main.innerHTML = grp('in', 'Phải trả nhà cung cấp', 'red') + grp('out', 'Khách hàng nợ', 'grn')
      main.querySelectorAll('[data-p]').forEach((el) => (el.onclick = () => partnerDebt(el.dataset.p, open)))
    }),

  products: (main) =>
    load(main, async () => {
      const [list, partners] = await Promise.all([api('/products'), api('/partners?type=supplier')])
      state.products = list
      state.partners = partners
      main.innerHTML = list.length ? list.map((p) => `<div class="item" data-id="${p.id}"><div class="row"><span class="t">${esc(p.name)}</span><span class="badge ${Number(p.stock) <= Number(p.min_stock) ? 'warn' : ''}">Tồn ${num(p.stock)} ${esc(p.unit)}</span></div>
        <div class="row mut"><span>Vốn ${money(p.cost_price)} · Bán ${money(p.sale_price)}</span><span>${esc(partners.find((s) => s.id === p.supplier_id)?.name || '')}</span></div></div>`).join('') : '<div class="empty">Chưa có hàng hóa</div>'
      main.querySelectorAll('.item').forEach((el) => (el.onclick = () => productForm(list.find((p) => p.id === el.dataset.id))))
      fab(main, () => productForm())
    }),

  partners: (main) =>
    load(main, async () => {
      const list = await api('/partners?type=' + state.ptype)
      main.innerHTML = `<div class="seg"><button data-t="supplier" class="${state.ptype === 'supplier' ? 'on' : ''}">Nguồn hàng</button><button data-t="customer" class="${state.ptype === 'customer' ? 'on' : ''}">Khách hàng</button></div>
        ${list.length ? list.map((p) => `<div class="item" data-id="${p.id}"><div class="t">${esc(p.name)}</div><div class="mut">${esc(p.phone || '---')} · ${esc(p.address || '---')}</div></div>`).join('') : '<div class="empty">Chưa có dữ liệu</div>'}`
      main.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => ((state.ptype = b.dataset.t), render())))
      main.querySelectorAll('.item').forEach((el) => (el.onclick = () => partnerForm(list.find((p) => p.id === el.dataset.id))))
      fab(main, () => partnerForm())
    })
}

// ---------- Form ----------
function partnerForm(p = {}) {
  sheet(`<h2>${p.id ? 'Sửa' : 'Thêm'} ${state.ptype === 'supplier' ? 'nguồn hàng' : 'khách hàng'}</h2><form>
    <label>Tên *</label><input name="name" required value="${esc(p.name)}" /><label>Điện thoại</label><input name="phone" type="tel" value="${esc(p.phone)}" />
    <label>Địa chỉ</label><input name="address" value="${esc(p.address)}" /><label>Ghi chú</label><textarea name="note">${esc(p.note)}</textarea>
    <div class="acts">${p.id ? '<button type="button" class="btn dan" id="del">Xoá</button>' : ''}<button class="btn">Lưu</button></div></form>`, (el, close) => {
    const f = $(el, 'form')
    f.onsubmit = guard(async (e) => {
      e.preventDefault()
      const b = Object.fromEntries(new FormData(f))
      b.type = p.type || state.ptype
      await api('/partners' + (p.id ? '/' + p.id : ''), p.id ? 'PUT' : 'POST', b)
      close()
      render()
    })
    $(el, '#del')?.addEventListener('click', guard(async () => {
      if (!confirm('Xoá đối tác này?')) return
      await api('/partners/' + p.id, 'DELETE')
      close()
      render()
    }))
  })
}

function productForm(p = {}) {
  sheet(`<h2>${p.id ? 'Sửa' : 'Thêm'} hàng hóa</h2><form>
    <label>Tên *</label><input name="name" required value="${esc(p.name)}" />
    <div class="grid2"><div><label>Đơn vị</label><input name="unit" value="${esc(p.unit || 'cái')}" /></div><div><label>Tồn kho</label><input name="stock" type="number" inputmode="decimal" step="any" min="0" value="${p.stock ?? 0}" /></div>
    <div><label>Giá vốn</label><input name="cost_price" type="number" inputmode="decimal" min="0" value="${p.cost_price ?? 0}" /></div><div><label>Giá bán</label><input name="sale_price" type="number" inputmode="decimal" min="0" value="${p.sale_price ?? 0}" /></div></div>
    <label>Cảnh báo khi tồn ≤</label><input name="min_stock" type="number" inputmode="decimal" min="0" value="${p.min_stock ?? 0}" />
    <label>Nguồn hàng</label><select name="supplier_id"><option value="">---</option>${state.partners.map((s) => `<option value="${s.id}" ${s.id === p.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <div class="acts">${p.id ? '<button type="button" class="btn dan" id="del">Xoá</button>' : ''}<button class="btn">Lưu</button></div></form>`, (el, close) => {
    const f = $(el, 'form')
    f.onsubmit = guard(async (e) => {
      e.preventDefault()
      await api('/products' + (p.id ? '/' + p.id : ''), p.id ? 'PUT' : 'POST', Object.fromEntries(new FormData(f)))
      close()
      render()
    })
    $(el, '#del')?.addEventListener('click', guard(async () => {
      if (!confirm('Xoá hàng hóa này?')) return
      await api('/products/' + p.id, 'DELETE')
      close()
      render()
    }))
  })
}

async function orderForm() {
  const type = state.ordType
  const [partners, products] = await Promise.all([api('/partners?type=' + (type === 'in' ? 'supplier' : 'customer')), api('/products')])
  if (!partners.length || !products.length) throw new Error('Cần thêm đối tác và hàng hóa trước')
  const price = (pr) => (type === 'in' ? pr.cost_price : pr.sale_price)
  const opts = products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
  sheet(`<h2>${type === 'in' ? 'Nhập hàng' : 'Bán hàng'}</h2><form>
    <label>${type === 'in' ? 'Nguồn hàng' : 'Khách hàng'}</label><select name="partner_id">${partners.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
    <label>Ngày</label><input name="order_date" type="date" value="${today()}" />
    <label>Mặt hàng (SL · Đơn giá)</label><div id="lines"></div>
    <button type="button" class="btn sec sm" id="add">+ Thêm dòng</button>
    <div class="row" style="margin:12px 0"><span>Tổng</span><b id="tot">0 ₫</b></div>
    <label>Đã thanh toán</label><input name="paid" type="number" inputmode="decimal" min="0" value="0" />
    <label>Ghi chú</label><input name="note" /><div class="acts"><button class="btn">Lưu đơn</button></div></form>`, (el, close) => {
    const lines = $(el, '#lines')
    const calc = () => {
      let t = 0
      lines.querySelectorAll('.line').forEach((l) => (t += Number($(l, '[name=qty]').value || 0) * Number($(l, '[name=price]').value || 0)))
      $(el, '#tot').textContent = money(t)
    }
    const addLine = () => {
      const l = document.createElement('div')
      l.className = 'line'
      l.innerHTML = `<select name="product_id">${opts}</select><input name="qty" type="number" inputmode="decimal" min="0" step="any" value="1" /><input name="price" type="number" inputmode="decimal" min="0" /><button type="button" class="btn sec sm" style="padding:0">✕</button>`
      const sel = $(l, 'select')
      const fill = () => ($(l, '[name=price]').value = price(products.find((p) => p.id === sel.value)))
      sel.onchange = () => (fill(), calc())
      l.oninput = calc
      $(l, 'button').onclick = () => (l.remove(), calc())
      lines.append(l)
      fill()
      calc()
    }
    addLine()
    $(el, '#add').onclick = addLine
    $(el, 'form').onsubmit = guard(async (e) => {
      e.preventDefault()
      const f = e.target
      const items = [...lines.querySelectorAll('.line')].map((l) => ({ product_id: $(l, '[name=product_id]').value, qty: $(l, '[name=qty]').value, price: $(l, '[name=price]').value }))
      await api('/orders', 'POST', { type, partner_id: f.partner_id.value, order_date: f.order_date.value, paid: f.paid.value, note: f.note.value, items })
      close()
      render()
    })
  })
}

async function orderDetail(id) {
  const o = await api('/orders/' + id)
  const draw = (el, close) => {
    $(el, '#del').onclick = guard(async () => {
      if (!confirm('Xoá đơn và hoàn tồn kho?')) return
      await api('/orders/' + id, 'DELETE')
      close()
      render()
    })
    $(el, '#pay')?.addEventListener('click', guard(async () => {
      const a = prompt('Số tiền thanh toán', o.debt)
      if (!a) return
      await api(`/orders/${id}/payments`, 'POST', { amount: a, paid_at: today() })
      close()
      render()
      orderDetail(id)
    }))
    el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = guard(async () => {
      if (!confirm('Xoá lần thanh toán này?')) return
      await api('/payments/' + b.dataset.pay, 'DELETE')
      close()
      render()
      orderDetail(id)
    })))
  }
  sheet(`<h2>${esc(o.code)} · ${esc(o.partner_name)}</h2><div class="mut">${dt(o.order_date)}${o.note ? ' · ' + esc(o.note) : ''}</div>
    <h3>Mặt hàng</h3>${o.items.map((i) => `<div class="row"><span>${esc(i.products?.name)} × ${num(i.qty)}</span><span>${money(i.qty * i.price)}</span></div>`).join('')}
    <div class="row" style="margin-top:8px"><b>Tổng</b><b>${money(o.total)}</b></div><div class="row"><span>Đã trả</span><span class="grn">${money(o.paid)}</span></div><div class="row"><span>Còn nợ</span><b class="red">${money(o.debt)}</b></div>
    <h3>Lịch sử thanh toán</h3>${o.payments.length ? o.payments.map((p) => `<div class="row"><span>${dt(p.paid_at)}</span><span>${money(p.amount)} <button class="btn sec sm" data-pay="${p.id}">✕</button></span></div>`).join('') : '<div class="mut">Chưa có</div>'}
    <div class="acts" style="margin-top:14px"><button class="btn dan" id="del">Xoá đơn</button>${Number(o.debt) > 0 ? '<button class="btn" id="pay">Thanh toán</button>' : ''}</div>`, draw)
}

function partnerDebt(pid, open) {
  const rows = open.filter((o) => o.partner_id === pid)
  sheet(`<h2>${esc(rows[0]?.partner_name)}</h2>${rows.map((o) => `<div class="item" data-id="${o.id}"><div class="row"><span>${esc(o.code)} · ${dt(o.order_date)}</span><b class="red">${money(o.debt)}</b></div></div>`).join('')}`, (el, close) =>
    el.querySelectorAll('.item').forEach((i) => (i.onclick = () => (close(), orderDetail(i.dataset.id))))
  )
}

render()
