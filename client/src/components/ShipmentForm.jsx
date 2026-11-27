import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { useLinks } from '../links'
import { SHIP_STATUS, dt, money, today } from '../utils'
import { Lnk } from './Bits.jsx'
import DateInput from './DateInput.jsx'

/** Thêm / sửa một chuyến xe. Mỗi chuyến thuộc một đơn hàng. */
export default function ShipmentForm({ shipment, order, close }) {
  const { run, reload } = useApp()
  const { openOrder, openPartner } = useLinks()
  const s = shipment || {}
  const [f, setF] = useState({ ship_date: s.ship_date || today(), vehicle: s.vehicle || '', driver: s.driver || '', fee: s.fee ?? 0, status: s.status || 'pending', note: s.note || '' })
  const [ord, setOrd] = useState(order || s.orders ? { id: order?.id || s.order_id, code: order?.code || s.orders.code, partner_id: order?.partner_id || s.orders.partner_id, partner_name: order?.partner_name || s.orders.partners?.name, order_date: order?.order_date || s.orders.order_date } : null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  // Tìm đơn để gắn chuyến (khi chưa chọn đơn)
  useEffect(() => {
    if (ord) return
    const t = setTimeout(() => {
      api('/orders?type=out&limit=30&q=' + encodeURIComponent(q)).then(setFound).catch(() => setFound([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q, ord])

  const submit = run(async (e) => {
    e.preventDefault()
    if (!ord) throw new Error('Chọn đơn hàng')
    const body = { ...f, order_id: ord.id }
    if (s.id) await api('/shipments/' + s.id, 'PUT', body)
    else await api('/shipments', 'POST', body)
    close()
    reload()
  })
  const del = run(async () => {
    if (!confirm('Xoá chuyến xe này?')) return
    await api('/shipments/' + s.id, 'DELETE')
    close()
    reload()
  })

  return (
    <form onSubmit={submit}>
      <h2>{s.id ? 'Sửa chuyến xe' : 'Thêm chuyến xe'}</h2>
      <label>Đơn hàng</label>
      {ord ? (
        <div className="card row">
          <span><Lnk onClick={() => openOrder(ord.id)}>{ord.code}</Lnk> · <Lnk onClick={() => openPartner(ord.partner_id)}>{ord.partner_name}</Lnk></span>
          {!s.id && !order && <button type="button" className="btn sec sm" onClick={() => setOrd(null)}>Đổi</button>}
        </div>
      ) : (
        <>
          <input placeholder="Tìm mã đơn / tên khách" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pick">
            {found.map((o) => (
              <div key={o.id} className="item link" onClick={() => setOrd(o)}>
                <div className="row"><span className="t">{o.partner_name}</span><b>{money(o.total)}</b></div>
                <div className="mut">{o.code} · {dt(o.order_date)}</div>
              </div>
            ))}
            {!found.length && <div className="state">Không có đơn</div>}
          </div>
        </>
      )}
      <div className="grid2">
        <div>
          <label>Ngày</label>
          <DateInput value={f.ship_date} onChange={(v) => setF({ ...f, ship_date: v })} />
        </div>
        <div>
          <label>Trạng thái</label>
          <select value={f.status} onChange={set('status')}>
            {Object.entries(SHIP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label>Biển số xe</label>
          <input value={f.vehicle} onChange={set('vehicle')} />
        </div>
        <div>
          <label>Tài xế</label>
          <input value={f.driver} onChange={set('driver')} />
        </div>
      </div>
      <label>Cước vận chuyển</label>
      <input type="number" inputMode="decimal" min="0" step="any" value={f.fee} onChange={set('fee')} />
      <label>Ghi chú</label>
      <input value={f.note} onChange={set('note')} />
      <div className="acts">
        {s.id && <button type="button" className="btn dan" onClick={del}>Xoá</button>}
        <button className="btn">Lưu</button>
      </div>
    </form>
  )
}
