import FilterBar, { useDateDraft } from '../components/FilterBar.jsx'
import { Page, Status } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { money, num, periodLabel, periodQS } from '../utils'

export default function Home() {
  const { period, goTab } = useApp()
  const { openProduct } = useLinks()
  const dates = useDateDraft()
  const st = useData(['/dashboard?' + periodQS(period)])
  const d = st.data?.[0]
  const label = periodLabel(period)
  return (
    <Page filters={<FilterBar dates={dates} onSubmit={dates.commit} />}>
      <Status state={st} />
      {d && (
        <>
          <div className="grid2">
            <div className="card stat link" onClick={() => goTab('debts')}><small>Khách nợ</small><b className="red">{money(d.receivable)}</b></div>
            <div className="card stat link" onClick={() => goTab('orders')}><small>Bán hàng</small><b>{money(d.sold)}</b></div>
            <div className="card stat"><small>Đã thu từ khách</small><b className="grn">{money(d.collected)}</b></div>
            <div className="card stat link" onClick={() => goTab('products')}><small>Giá trị tồn kho (giá vốn)</small><b>{money(d.stock_value)}</b></div>
          </div>
          <div className="mut hint">Số liệu: {label}</div>
          <h3>Sắp hết hàng</h3>
          {d.low_stock.length ? (
            d.low_stock.map((p) => (
              <div className="item row link" key={p.id} onClick={() => openProduct(p.id)}>
                <span className="t">{p.name}</span>
                <span className="badge warn nw">{num(p.stock)} {p.unit}</span>
              </div>
            ))
          ) : (
            <div className="empty">Không có</div>
          )}
        </>
      )}
    </Page>
  )
}
