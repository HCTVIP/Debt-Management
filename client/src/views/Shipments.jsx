import { useState } from 'react'
import PeriodBar from '../components/PeriodBar.jsx'
import { Fab, Lnk, Seg, Status } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { SHIP_STATUS, dt, money, periodLabel, periodQS, qs } from '../utils'

export default function Shipments() {
  const { period } = useApp()
  const { openShipment, openOrder, openPartner } = useLinks()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const st = useData(['/shipments?' + qs(periodQS(period), status && 'status=' + status)])
  const k = q.trim().toLowerCase()
  const rows = (st.data?.[0] || []).filter(
    (s) => !k || [s.vehicle, s.driver, s.orders?.code, s.orders?.partners?.name].some((v) => (v || '').toLowerCase().includes(k))
  )
  const fee = rows.reduce((t, s) => t + Number(s.fee), 0)
  return (
    <>
      <input placeholder="Tìm biển số / tài xế / khách / mã đơn" value={q} onChange={(e) => setQ(e.target.value)} />
      <Seg value={status} onChange={setStatus} options={[['', 'Tất cả'], ...Object.entries(SHIP_STATUS)]} />
      <PeriodBar />
      <Status state={st} />
      {st.data && (
        <>
          <div className="card sum">
            <span>{rows.length} chuyến · {periodLabel(period)}</span>
            <span>Cước <b>{money(fee)}</b></span>
          </div>
          {rows.length ? (
            rows.map((s) => (
              <div className="item link" key={s.id} onClick={() => openShipment(s)}>
                <div className="row">
                  <span className="t">{s.vehicle || 'Chưa có xe'}{s.driver ? ' · ' + s.driver : ''}</span>
                  <span className={'badge ' + (s.status === 'delivered' ? '' : 'warn')}>{SHIP_STATUS[s.status]}</span>
                </div>
                <div className="row mut">
                  <span>
                    <Lnk onClick={() => openPartner(s.orders.partner_id)}>{s.orders?.partners?.name}</Lnk> · <Lnk onClick={() => openOrder(s.order_id)}>{s.orders?.code}</Lnk>
                  </span>
                  <span className="nw">{dt(s.ship_date)} · {money(s.fee)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">Không có chuyến xe</div>
          )}
        </>
      )}
      <Fab onClick={() => openShipment()} />
    </>
  )
}
