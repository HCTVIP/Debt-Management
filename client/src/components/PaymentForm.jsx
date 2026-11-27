import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { today } from '../utils'
import DateInput from './DateInput.jsx'

/** Thêm hoặc sửa một lần thanh toán (công nợ) của đơn. */
export default function PaymentForm({ order, pay, close }) {
  const { run, reload } = useApp()
  const [f, setF] = useState({ amount: pay ? pay.amount : order.debt, paid_at: pay ? pay.paid_at : today(), note: pay?.note || '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = run(async (e) => {
    e.preventDefault()
    if (pay) await api('/payments/' + pay.id, 'PUT', f)
    else await api(`/orders/${order.id}/payments`, 'POST', f)
    close()
    reload()
  })
  return (
    <form onSubmit={submit}>
      <h2>{pay ? 'Sửa thanh toán' : 'Thanh toán'} · {order.code}</h2>
      <label>Số tiền</label>
      <input type="number" inputMode="decimal" min="0" step="any" required value={f.amount} onChange={set('amount')} />
      <label>Ngày</label>
      <DateInput value={f.paid_at} onChange={(v) => setF({ ...f, paid_at: v })} />
      <label>Ghi chú</label>
      <input value={f.note} onChange={set('note')} />
      <div className="acts"><button className="btn">Lưu</button></div>
    </form>
  )
}
