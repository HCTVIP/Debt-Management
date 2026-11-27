import { useState } from 'react'
import FilterBar, { useDateDraft } from '../components/FilterBar.jsx'
import { Avatar, Lnk, OrderRow, Page, Seg, Status, useChunk } from '../components/Bits.jsx'
import Ledger from './Ledger.jsx'
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

function DebtList({ seg }) {
  const { period, openSheet } = useApp()
  const dates = useDateDraft()
  const [text, setText] = useState('') // đang gõ
  const [q, setQ] = useState('') // đã áp dụng khi bấm Tìm
  const st = useData(['/debts?' + periodQS(period)])
  const k = q.trim().toLowerCase()
  const rows = (st.data?.[0] || []).filter((d) => d.type === 'out' && (!k || d.partner_name.toLowerCase().includes(k)))
  const [shown, mark] = useChunk(rows)
  return (
    <Page
      filters={
        <>
          {seg}
          <FilterBar placeholder="Tìm tên khách" q={text} setQ={setText} dates={dates} onSubmit={() => dates.commit() && setQ(text)} />
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
            <>
              {shown.map((r) => (
                <div className="item link orow" key={r.partner_id} onClick={() => openSheet(() => <CustomerDebt partnerId={r.partner_id} name={r.partner_name} />)}>
                  <Avatar name={r.partner_name} />
                  <div className="obody">
                    <div className="row"><span className="t">{r.partner_name}</span><b className="red nw">{money(r.debt)}</b></div>
                    <small className="mut">{r.orders} đơn chưa thanh toán xong</small>
                  </div>
                </div>
              ))}
              {mark}
            </>
          ) : (
            <div className="empty">Không có công nợ</div>
          )}
        </>
      )}
    </Page>
  )
}

/** Tab Công nợ gồm hai phần: công nợ khách hàng và sổ thu chi. */
export default function Debts() {
  const [view, setView] = useState('debts')
  const seg = <Seg value={view} onChange={setView} options={[['debts', 'Công nợ'], ['cash', 'Thu chi']]} />
  return view === 'debts' ? <DebtList seg={seg} /> : <Ledger seg={seg} />
}
