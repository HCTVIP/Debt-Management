import { api } from '../api'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { SHIP_STATUS, dt, money, num } from '../utils'
import { Lnk, Status } from './Bits.jsx'
import OrderForm from './OrderForm.jsx'
import PaymentForm from './PaymentForm.jsx'

export default function OrderDetail({ id, close }) {
  const { openSheet, reload, run } = useApp()
  const { openPartner, openProduct, openShipment } = useLinks()
  const st = useData([`/orders/${id}`, { path: `/shipments?order_id=${id}`, optional: true }])
  if (!st.data) return <Status state={st} />
  const [o] = st.data
  // Bảng vận chuyển có thể chưa được tạo: bỏ qua lỗi, chỉ ẩn mục này
  const ships = st.data[1] || []

  const del = run(async () => {
    if (!confirm('Xoá đơn?')) return
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
      <h2>{o.code}</h2>
      <div className="row">
        <b><Lnk onClick={() => openPartner(o.partner_id)}>{o.partner_name}</Lnk></b>
        <span className="mut">{dt(o.order_date)}</span>
      </div>
      {o.note && <div className="mut">{o.note}</div>}
      <h3>Mặt hàng</h3>
      {o.items.length ? (
        o.items.map((i) => (
          <div className="row" key={i.id}>
            <span><Lnk onClick={() => openProduct(i.product_id)}>{i.products?.name}</Lnk> × {num(i.qty)} × {money(i.price)}</span>
            <span>{money(i.qty * i.price)}</span>
          </div>
        ))
      ) : (
        <div className="mut">Không có mặt hàng (nợ đầu kỳ / điều chỉnh)</div>
      )}
      <div className="row" style={{ marginTop: 8 }}><b>Tổng</b><b>{money(o.total)}</b></div>
      <div className="row"><span>Đã trả</span><span className="grn">{money(o.paid)}</span></div>
      <div className="row"><span>Còn nợ</span><b className="red">{money(o.debt)}</b></div>

      <h3>Vận chuyển</h3>
      {ships.length ? (
        ships.map((s) => (
          <div className="item link" key={s.id} onClick={() => openShipment(s, o)}>
            <div className="row">
              <span className="t">{s.vehicle || 'Chưa có xe'}{s.driver ? ' · ' + s.driver : ''}</span>
              <span className={'badge ' + (s.status === 'delivered' ? '' : 'warn')}>{SHIP_STATUS[s.status]}</span>
            </div>
            <div className="row mut"><span>{dt(s.ship_date)}</span><span>Cước {money(s.fee)}</span></div>
          </div>
        ))
      ) : (
        <div className="mut">Chưa có chuyến xe</div>
      )}
      <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => openShipment(null, o)}>+ Thêm chuyến xe</button>

      <h3>Lịch sử thanh toán</h3>
      {o.payments.length ? (
        o.payments.map((p) => (
          <div className="row" style={{ marginBottom: 4 }} key={p.id}>
            <span>{dt(p.paid_at)}{p.note ? ' · ' + p.note : ''}</span>
            <span className="nw">
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
