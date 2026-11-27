import { useEffect, useState } from 'react'
import PeriodBar from '../components/PeriodBar.jsx'
import OrderForm from '../components/OrderForm.jsx'
import { Fab, OrderRow, Page, Status } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { money, periodLabel, periodQS, qs } from '../utils'

export default function Orders() {
  const { period, ord, setOrd, openSheet } = useApp()
  const [text, setText] = useState(ord.q)
  useEffect(() => setText(ord.q), [ord.q])
  const st = useData([
    '/orders?' + qs('type=out', periodQS(period), ord.partner && 'partner_id=' + ord.partner, ord.q && 'q=' + encodeURIComponent(ord.q)),
    '/partners?type=customer'
  ])
  const [list, partners] = st.data || [[], []]
  const total = list.reduce((s, o) => s + Number(o.total), 0)
  const debt = list.reduce((s, o) => s + Number(o.debt), 0)
  return (
    <Page
      filters={
        <>
          {/* Tìm kiếm + chọn khách hàng trong một khối; nút Tìm cao bằng ô nhập */}
          <div className="fgroup">
            <form
              className="frow"
              onSubmit={(e) => {
                e.preventDefault()
                setOrd({ q: text.trim() })
              }}
            >
              <input placeholder="Tìm mã đơn / tên khách" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn">Tìm</button>
            </form>
            <select value={ord.partner} onChange={(e) => setOrd({ partner: e.target.value })}>
              <option value="">Tất cả khách hàng</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <PeriodBar />
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
