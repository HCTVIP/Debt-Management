import { useState } from 'react'
import CashForm from '../components/CashForm.jsx'
import FilterBar, { useDateDraft } from '../components/FilterBar.jsx'
import { Fab, Page, Status, useChunk } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { dt, money, periodQS } from '../utils'

/** Sổ thu chi: thu từ khách (thanh toán) + thu khác + chi, theo kỳ. */
export default function Ledger({ seg }) {
  const { period, openSheet } = useApp()
  const { openOrder } = useLinks()
  const dates = useDateDraft()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const st = useData(['/ledger?' + periodQS(period)])
  const data = st.data?.[0]
  const k = q.trim().toLowerCase()
  const items = (data?.items || []).filter((i) => !k || [i.title, i.sub, i.note, i.category].some((v) => (v || '').toLowerCase().includes(k)))
  const [shown, mark] = useChunk(items)
  const t = data?.totals
  const open = (i) => (i.source === 'payment' ? openOrder(i.order_id) : openSheet((close) => <CashForm entry={i} close={close} />))
  return (
    <Page
      filters={
        <>
          {seg}
          <FilterBar placeholder="Tìm khách / danh mục / ghi chú" q={text} setQ={setText} dates={dates} onSubmit={() => dates.commit() && setQ(text)} />
        </>
      }
    >
      <Status state={st} />
      {data && (
        <>
          {!data.cashflow_ready && <div className="card warnbox">Chưa tạo bảng thu chi. Chạy <b>supabase/003_cashflow.sql</b> trong Supabase SQL Editor để ghi khoản chi và thu khác.</div>}
          <div className="card cashsum">
            <div><small>Thu</small><b className="grn">{money(t.in)}</b></div>
            <div><small>Chi</small><b className="red">{money(t.out)}</b></div>
            <div><small>Còn lại</small><b>{money(t.balance)}</b></div>
          </div>
          <div className="mut hint">{items.length} khoản</div>
          {items.length ? (
            <>
              {shown.map((i) => (
                <div className="item link orow" key={i.source + i.id} onClick={() => open(i)}>
                  <div className={'cashdot ' + i.kind} aria-hidden="true">{i.kind === 'in' ? '↓' : '↑'}</div>
                  <div className="obody">
                    <div className="row">
                      <span className="t">{i.title}</span>
                      <b className={'nw ' + (i.kind === 'in' ? 'grn' : 'red')}>{i.kind === 'in' ? '+' : '−'}{money(i.amount)}</b>
                    </div>
                    <div className="mut">{dt(i.date)}{i.sub ? ' · ' + i.sub : ''}{i.note ? ' · ' + i.note : ''}</div>
                  </div>
                </div>
              ))}
              {mark}
            </>
          ) : (
            <div className="empty">Không có khoản thu chi</div>
          )}
        </>
      )}
      <Fab onClick={() => openSheet((close) => <CashForm close={close} />)} />
    </Page>
  )
}
