import { useState } from 'react'
import FilterBar, { useDateDraft } from '../components/FilterBar.jsx'
import { Fab, Lnk, Page, Seg, Status } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { SHIP_STATUS, dt, money, periodLabel, periodQS, qs } from '../utils'

export default function Shipments() {
  const { period } = useApp()
  const { openShipment, openOrder, openPartner } = useLinks()
  const dates = useDateDraft()
  // Nháp (đang nhập) và đã áp dụng (dùng để gọi API / lọc): chỉ áp dụng khi bấm Tìm
  const [draft, setDraft] = useState({ q: '', status: '' })
  const [applied, setApplied] = useState({ q: '', status: '' })
  const { status } = applied
  const st = useData(['/shipments?' + qs(periodQS(period), status && 'status=' + status)])
  const k = applied.q.toLowerCase()
  const rows = (st.data?.[0] || []).filter(
    (s) => !k || [s.vehicle, s.driver, s.orders?.code, s.orders?.partners?.name].some((v) => (v || '').toLowerCase().includes(k))
  )
  const fee = rows.reduce((t, s) => t + Number(s.fee), 0)
  return (
    <Page
      filters={
        <FilterBar
          placeholder="Tìm biển số / tài xế / khách / mã đơn"
          q={draft.q}
          setQ={(q) => setDraft({ ...draft, q })}
          dates={dates}
          onSubmit={() => dates.commit() && setApplied({ q: draft.q.trim(), status: draft.status })}
        >
          <Seg value={draft.status} onChange={(s) => setDraft({ ...draft, status: s })} options={[['', 'Tất cả'], ...Object.entries(SHIP_STATUS)]} />
        </FilterBar>
      }
    >
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
    </Page>
  )
}
