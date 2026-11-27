import { useApp, useData } from '../ctx'
import { money } from '../utils'
import { OrderRow, Status } from './Bits.jsx'
import PartnerForm from './PartnerForm.jsx'

/** Thông tin khách hàng, công nợ và các đơn hàng của khách (mở từ tên khách ở mọi tab). */
export default function PartnerDetail({ id, close }) {
  const { openSheet, setOrd, goTab } = useApp()
  const st = useData([`/partners/${id}`, `/orders?partner_id=${id}`])
  if (!st.data) return <Status state={st} />
  const [p, orders] = st.data
  const debt = orders.reduce((s, o) => s + Number(o.debt), 0)
  const total = orders.reduce((s, o) => s + Number(o.total), 0)
  const shown = orders.slice(0, 100)
  return (
    <>
      <h2>{p.name}</h2>
      <div className="mut">
        {p.phone || '---'} · {p.address || '---'}
        {p.note && <><br />{p.note}</>}
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div className="card stat"><small>Tổng giá trị đơn</small><b>{money(total)}</b></div>
        <div className="card stat"><small>Còn nợ</small><b className="red">{money(debt)}</b></div>
      </div>
      <div className="acts">
        <button className="btn sec" onClick={() => openSheet((c) => <PartnerForm partner={p} close={c} />)}>Sửa khách hàng</button>
        <button
          className="btn"
          onClick={() => {
            // Sang tab Đơn hàng đã lọc theo khách này; dùng bộ lọc tháng / năm / khoảng ngày ở đó
            setOrd({ partner: p.id, q: '' })
            goTab('orders')
            close()
          }}
        >
          Lọc theo kỳ
        </button>
      </div>
      <h3>{orders.length} đơn hàng{orders.length > shown.length ? ` (hiện ${shown.length} đơn mới nhất)` : ''}</h3>
      {shown.length ? shown.map((o) => <OrderRow key={o.id} o={o} />) : <div className="empty">Chưa có đơn</div>}
    </>
  )
}
