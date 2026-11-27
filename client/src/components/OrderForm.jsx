import { useState } from 'react'
import { api } from '../api'
import { useApp, useData } from '../ctx'
import { money, today } from '../utils'
import { Status } from './Bits.jsx'

/**
 * Thêm / sửa đơn. Đơn có mặt hàng: sửa từng dòng. Đơn không có mặt hàng (nợ đầu kỳ, điều chỉnh): sửa tổng tiền.
 */
export default function OrderForm({ order, type: typeProp, close }) {
  const edit = !!order
  const type = edit ? order.type : typeProp
  const st = useData([`/partners?type=${type === 'in' ? 'supplier' : 'customer'}`, '/products'])
  if (!st.data) return <Status state={st} />
  const [partners, products] = st.data
  return <Form {...{ edit, order, type, partners, products, close }} />
}

function Form({ edit, order, type, partners, products, close }) {
  const { run, reload, toast } = useApp()
  const noItems = edit && order.items.length === 0
  const priceOf = (pid) => {
    const p = products.find((x) => x.id === pid)
    return p ? (type === 'in' ? p.cost_price : p.sale_price) : 0
  }
  const blank = () => ({ product_id: products[0]?.id, qty: 1, price: priceOf(products[0]?.id) })
  const [f, setF] = useState({
    partner_id: edit ? order.partner_id : partners[0]?.id,
    order_date: edit ? order.order_date : today(),
    note: edit ? order.note || '' : '',
    paid: 0,
    total: edit ? order.total : 0
  })
  const [items, setItems] = useState(edit ? order.items.map((i) => ({ product_id: i.product_id, qty: i.qty, price: i.price })) : noItems ? [] : [blank()])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setItem = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const sum = items.reduce((t, i) => t + Number(i.qty || 0) * Number(i.price || 0), 0)

  if (!partners.length || (!noItems && !products.length)) {
    return <div className="state">Cần thêm đối tác và hàng hóa trước</div>
  }

  const submit = run(async (e) => {
    e.preventDefault()
    const body = { partner_id: f.partner_id, order_date: f.order_date, note: f.note }
    if (noItems) body.total = f.total
    else body.items = items
    if (edit) {
      await api('/orders/' + order.id, 'PUT', body)
      toast('Đã cập nhật đơn')
    } else await api('/orders', 'POST', { ...body, type, paid: f.paid })
    close()
    reload()
  })

  return (
    <form onSubmit={submit}>
      <h2>{edit ? 'Sửa đơn ' + order.code : type === 'in' ? 'Nhập hàng' : 'Bán hàng'}</h2>
      <label>{type === 'in' ? 'Nguồn hàng' : 'Khách hàng'}</label>
      <select value={f.partner_id} onChange={set('partner_id')}>
        {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label>Ngày</label>
      <input type="date" value={f.order_date} onChange={set('order_date')} />
      {noItems ? (
        <>
          <label>Tổng tiền</label>
          <input type="number" inputMode="decimal" min="0" value={f.total} onChange={set('total')} />
        </>
      ) : (
        <>
          <label>Mặt hàng (SL · Đơn giá)</label>
          {items.map((it, i) => (
            <div className="line" key={i}>
              <select value={it.product_id} onChange={(e) => setItem(i, { product_id: e.target.value, price: priceOf(e.target.value) })}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" inputMode="decimal" min="0" step="any" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
              <input type="number" inputMode="decimal" min="0" step="any" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} />
              <button type="button" className="btn sec sm" style={{ padding: 0 }} onClick={() => items.length > 1 ? setItems(items.filter((_, j) => j !== i)) : toast('Đơn cần ít nhất 1 mặt hàng')}>✕</button>
            </div>
          ))}
          <button type="button" className="btn sec sm" onClick={() => setItems([...items, blank()])}>+ Thêm dòng</button>
          <div className="row" style={{ margin: '12px 0' }}><span>Tổng</span><b>{money(sum)}</b></div>
        </>
      )}
      {!edit && (
        <>
          <label>Đã thanh toán</label>
          <input type="number" inputMode="decimal" min="0" value={f.paid} onChange={set('paid')} />
        </>
      )}
      <label>Ghi chú</label>
      <input value={f.note} onChange={set('note')} />
      <div className="acts"><button className="btn">{edit ? 'Lưu thay đổi' : 'Lưu đơn'}</button></div>
    </form>
  )
}
