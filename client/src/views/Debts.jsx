import { useState } from 'react'
import PeriodBar from '../components/PeriodBar.jsx'
import { Lnk, OrderRow, Page, Status } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { money, periodLabel, periodQS } from '../utils'

function CustomerDebt({ partnerId, name }) {
  const { period } = useApp()
  const { openPartner } = useLinks()
  const st = useData([`/orders?open=1&partner_id=${partnerId}&${periodQS(period)}`])
  if (!st.data) return <Status state={st} />
  return (
    <>
      <h2><Lnk onClick={() => openPartner(partnerId)}>{name}</Lnk></h2>
      {st.data[0].map((o) => <OrderRow key={o.id} o={o} />)}
    </>
  )
}

export default function Debts() {
  const { period, openSheet } = useApp()
  const [q, setQ] = useState('')
  const st = useData(['/debts?' + periodQS(period)])
  const k = q.trim().toLowerCase()
  const rows = (st.data?.[0] || []).filter((d) => d.type === 'out' && (!k || d.partner_name.toLowerCase().includes(k)))
  return (
    <Page
      filters={
        <>
          <input placeholder="Tìm tên khách" value={q} onChange={(e) => setQ(e.target.value)} />
          <PeriodBar />
        </>
      }
    >
      <Status state={st} />
      {st.data && (
        <>
          <div className="card sum">
            <span>{rows.length} khách nợ · {periodLabel(period)}</span>
            <b className="red">{money(rows.reduce((s, r) => s + r.debt, 0))}</b>
          </div>
          {rows.length ? (
            rows.map((r) => (
              <div className="item link" key={r.partner_id} onClick={() => openSheet(() => <CustomerDebt partnerId={r.partner_id} name={r.partner_name} />)}>
                <div className="row"><span className="t">{r.partner_name}</span><b className="red nw">{money(r.debt)}</b></div>
                <small className="mut">{r.orders} đơn chưa thanh toán xong</small>
              </div>
            ))
          ) : (
            <div className="empty">Không có công nợ</div>
          )}
        </>
      )}
    </Page>
  )
}
