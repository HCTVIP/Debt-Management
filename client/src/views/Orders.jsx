import { useEffect, useState } from 'react'
import PeriodBar from '../components/PeriodBar.jsx'
import OrderForm from '../components/OrderForm.jsx'
import { Fab, OrderRow, Seg, Status, useOpenOrder } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { money, periodLabel, periodQS, qs } from '../utils'

export default function Orders() {
  const { period, ord, setOrd, openSheet } = useApp()
  const openOrder = useOpenOrder()
  const [text, setText] = useState(ord.q)
  useEffect(() => setText(ord.q), [ord.q])
  const partnerType = ord.type === 'in' ? 'supplier' : 'customer'
  const st = useData([
    '/orders?' + qs('type=' + ord.type, periodQS(period), ord.partner && 'partner_id=' + ord.partner, ord.q && 'q=' + encodeURIComponent(ord.q)),
    '/partners?type=' + partnerType
  ])
  const [list, partners] = st.data || [[], []]
  const total = list.reduce((s, o) => s + Number(o.total), 0)
  const debt = list.reduce((s, o) => s + Number(o.debt), 0)
  const word = ord.type === 'in' ? 'nguồn hàng' : 'khách hàng'
  return (
    <>
      <Seg value={ord.type} onChange={(type) => setOrd({ type, partner: '' })} options={[['in', 'Nhập hàng'], ['out', 'Bán hàng']]} />
      <form
        className="row"
        style={{ gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault()
          setOrd({ q: text.trim() })
        }}
      >
        <input placeholder="Tìm mã đơn / tên đối tác" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn sm" style={{ marginBottom: 10 }}>Tìm</button>
      </form>
      <select value={ord.partner} onChange={(e) => setOrd({ partner: e.target.value })}>
        <option value="">Tất cả {word}</option>
        {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <PeriodBar />
      <Status state={st} />
      {st.data && (
        <>
          <div className="card row">
            <span>{list.length} đơn · {periodLabel(period)}</span>
            <span><b>{money(total)}</b> · <span className="red">nợ {money(debt)}</span></span>
          </div>
          {list.length ? list.map((o) => <OrderRow key={o.id} o={o} onClick={() => openOrder(o.id)} />) : <div className="empty">Không có đơn</div>}
        </>
      )}
      <Fab onClick={() => openSheet((close) => <OrderForm type={ord.type} close={close} />)} />
    </>
  )
}
