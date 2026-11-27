import PeriodBar from '../components/PeriodBar.jsx'
import { OrderRow, Status, useOpenOrder } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { money, periodQS } from '../utils'

function PartnerDebt({ partnerId, name, close }) {
  const { period } = useApp()
  const openOrder = useOpenOrder()
  const st = useData([`/orders?open=1&partner_id=${partnerId}&${periodQS(period)}`])
  if (!st.data) return <Status state={st} />
  return (
    <>
      <h2>{name}</h2>
      {st.data[0].map((o) => <OrderRow key={o.id} o={o} onClick={() => (close(), openOrder(o.id))} />)}
    </>
  )
}

export default function Debts() {
  const { period, openSheet } = useApp()
  const st = useData(['/debts?' + periodQS(period)])
  const debts = st.data?.[0] || []
  const group = (type, title, cls) => {
    const rows = debts.filter((d) => d.type === type)
    return (
      <>
        <h3>{title} <span className={cls}>{money(rows.reduce((s, r) => s + r.debt, 0))}</span></h3>
        {rows.length ? (
          rows.map((r) => (
            <div className="item link" key={r.partner_id} onClick={() => openSheet((close) => <PartnerDebt partnerId={r.partner_id} name={r.partner_name} close={close} />)}>
              <div className="row"><span className="t">{r.partner_name}</span><b className={cls}>{money(r.debt)}</b></div>
              <small className="mut">{r.orders} đơn chưa thanh toán xong</small>
            </div>
          ))
        ) : (
          <div className="empty">Không có công nợ</div>
        )}
      </>
    )
  }
  return (
    <>
      <PeriodBar />
      <Status state={st} />
      {st.data && (
        <>
          {group('in', 'Phải trả nhà cung cấp', 'red')}
          {group('out', 'Khách hàng nợ', 'grn')}
        </>
      )}
    </>
  )
}
