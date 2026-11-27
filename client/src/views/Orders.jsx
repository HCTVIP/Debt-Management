import { useEffect, useState } from 'react'
import FilterBar, { useDateDraft } from '../components/FilterBar.jsx'
import OrderForm from '../components/OrderForm.jsx'
import { Fab, OrderRow, Page, Status } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { money, periodLabel, periodQS, qs } from '../utils'

export default function Orders() {
  const { period, ord, setOrd, openSheet } = useApp()
  const dates = useDateDraft()
  const [text, setText] = useState(ord.q)
  useEffect(() => setText(ord.q), [ord.q])
  // API chỉ được gọi theo bộ lọc đã áp dụng (period, ord), không gọi khi đang gõ
  const st = useData([
    '/orders?' + qs('type=out', periodQS(period), ord.partner && 'partner_id=' + ord.partner, ord.q && 'q=' + encodeURIComponent(ord.q)),
    ...(ord.partner ? [{ path: '/partners/' + ord.partner, optional: true }] : [])
  ])
  const [list, partner] = st.data || [[], null]
  const total = list.reduce((s, o) => s + Number(o.total), 0)
  const debt = list.reduce((s, o) => s + Number(o.debt), 0)
  const submit = () => {
    if (dates.commit()) setOrd({ q: text.trim() })
  }
  return (
    <Page
      filters={
        <>
          <FilterBar placeholder="Tìm mã đơn / tên khách" q={text} setQ={setText} dates={dates} onSubmit={submit} />
          {/* Đang lọc theo một khách (mở từ thông tin khách): bấm ✕ để bỏ lọc */}
          {ord.partner && (
            <div className="chip">
              <span>Khách: <b>{partner?.name || '...'}</b></span>
              <button type="button" aria-label="Bỏ lọc khách" onClick={() => setOrd({ partner: '' })}>✕</button>
            </div>
          )}
        </>
      }
    >
      <Status state={st} />
      {st.data && (
        <>
          <div className="card sum">
            <span>{list.length} đơn · {periodLabel(period)}</span>
            <span><b>{money(total)}</b> · <span className="red">nợ {money(debt)}</span></span>
          </div>
          {list.length ? list.map((o) => <OrderRow key={o.id} o={o} />) : <div className="empty">Không có đơn</div>}
        </>
      )}
      <Fab onClick={() => openSheet((close) => <OrderForm close={close} />)} />
    </Page>
  )
}
