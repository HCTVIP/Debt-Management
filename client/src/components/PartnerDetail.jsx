import { useApp, useData } from '../ctx'
import { money } from '../utils'
import { OrderRow, Status, useOpenOrder } from './Bits.jsx'
import PartnerForm from './PartnerForm.jsx'

/** Chi tiết đối tác: thông tin, công nợ và các đơn hàng của đối tác. */
export default function PartnerDetail({ partner: p, close }) {
  const { openSheet, setOrd, goTab } = useApp()
  const openOrder = useOpenOrder()
  const st = useData([`/orders?partner_id=${p.id}`])
  if (!st.data) return <Status state={st} />
  const [orders] = st.data
  const debt = orders.reduce((s, o) => s + Number(o.debt), 0)
  const total = orders.reduce((s, o) => s + Number(o.total), 0)
  const shown = orders.slice(0, 100)
  const debtCls = p.type === 'customer' ? 'grn' : 'red'
  return (
    <>
      <h2>{p.name}</h2>
      <div className="mut">
        {p.phone || '---'} · {p.address || '---'}
        {p.note && <><br />{p.note}</>}
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div className="card stat"><small>Tổng giá trị đơn</small><b>{money(total)}</b></div>
        <div className="card stat"><small>Còn nợ</small><b className={debtCls}>{money(debt)}</b></div>
      </div>
      <div className="acts">
        <button className="btn sec" onClick={() => openSheet((c) => <PartnerForm partner={p} close={c} />)}>Sửa đối tác</button>
        <button
          className="btn"
          onClick={() => {
            // Chuyển sang màn Đơn hàng đã lọc theo đối tác này; dùng bộ lọc tháng / năm / khoảng ngày ở đó
            setOrd({ type: p.type === 'supplier' ? 'in' : 'out', partner: p.id, q: '' })
            goTab('orders')
            close()
          }}
        >
          Lọc theo kỳ
        </button>
      </div>
      <h3>{orders.length} đơn hàng{orders.length > shown.length ? ` (hiện ${shown.length} đơn mới nhất)` : ''}</h3>
      {shown.length ? shown.map((o) => <OrderRow key={o.id} o={o} onClick={() => openOrder(o.id)} />) : <div className="empty">Chưa có đơn</div>}
    </>
  )
}
