import { api } from '../api'
import { useApp, useData } from '../ctx'
import { dt, money, num } from '../utils'
import { Status } from './Bits.jsx'
import OrderForm from './OrderForm.jsx'
import PaymentForm from './PaymentForm.jsx'

export default function OrderDetail({ id, close }) {
  const { openSheet, reload, run } = useApp()
  const st = useData([`/orders/${id}`])
  if (!st.data) return <Status state={st} />
  const [o] = st.data

  const del = run(async () => {
    if (!confirm('Xoá đơn và hoàn tồn kho?')) return
    await api('/orders/' + id, 'DELETE')
    close()
    reload()
  })
  const delPay = run(async (pid) => {
    if (!confirm('Xoá lần thanh toán này?')) return
    await api('/payments/' + pid, 'DELETE')
    reload()
  })
  return (
    <>
      <h2>{o.code} · {o.partner_name}</h2>
      <div className="mut">{dt(o.order_date)}{o.note ? ' · ' + o.note : ''}</div>
      <h3>Mặt hàng</h3>
      {o.items.length ? (
        o.items.map((i) => (
          <div className="row" key={i.id}>
            <span>{i.products?.name} × {num(i.qty)} × {money(i.price)}</span>
            <span>{money(i.qty * i.price)}</span>
          </div>
        ))
      ) : (
        <div className="mut">Không có mặt hàng (nợ đầu kỳ / điều chỉnh)</div>
      )}
      <div className="row" style={{ marginTop: 8 }}><b>Tổng</b><b>{money(o.total)}</b></div>
      <div className="row"><span>Đã trả</span><span className="grn">{money(o.paid)}</span></div>
      <div className="row"><span>Còn nợ</span><b className="red">{money(o.debt)}</b></div>
      <h3>Lịch sử thanh toán</h3>
      {o.payments.length ? (
        o.payments.map((p) => (
          <div className="row" style={{ marginBottom: 4 }} key={p.id}>
            <span>{dt(p.paid_at)}{p.note ? ' · ' + p.note : ''}</span>
            <span>
              {money(p.amount)}{' '}
              <button className="btn sec sm" onClick={() => openSheet((c) => <PaymentForm order={o} pay={p} close={c} />)}>✎</button>{' '}
              <button className="btn sec sm" onClick={() => delPay(p.id)}>✕</button>
            </span>
          </div>
        ))
      ) : (
        <div className="mut">Chưa có</div>
      )}
      <div className="acts" style={{ marginTop: 14 }}>
        <button className="btn dan" onClick={del}>Xoá</button>
        <button className="btn sec" onClick={() => openSheet((c) => <OrderForm order={o} close={c} />)}>Sửa đơn</button>
        {Number(o.debt) > 0 && <button className="btn" onClick={() => openSheet((c) => <PaymentForm order={o} close={c} />)}>Thanh toán</button>}
      </div>
    </>
  )
}
