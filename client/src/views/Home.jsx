import PeriodBar from '../components/PeriodBar.jsx'
import { Status } from '../components/Bits.jsx'
import { useApp, useData } from '../ctx'
import { money, num, periodLabel, periodQS } from '../utils'

export default function Home() {
  const { period } = useApp()
  const st = useData(['/dashboard?' + periodQS(period)])
  const d = st.data?.[0]
  const label = periodLabel(period)
  return (
    <>
      <PeriodBar />
      <Status state={st} />
      {d && (
        <>
          <div className="grid2">
            <div className="card stat"><small>Phải trả NCC ({label})</small><b className="red">{money(d.payable)}</b></div>
            <div className="card stat"><small>Khách nợ ({label})</small><b className="grn">{money(d.receivable)}</b></div>
            <div className="card stat"><small>Nhập hàng</small><b>{money(d.purchased)}</b></div>
            <div className="card stat"><small>Bán hàng</small><b>{money(d.sold)}</b></div>
            <div className="card stat"><small>Đã thu từ khách</small><b className="grn">{money(d.collected)}</b></div>
            <div className="card stat"><small>Đã trả NCC</small><b>{money(d.paid_out)}</b></div>
          </div>
          <div className="card stat"><small>Giá trị tồn kho (theo giá vốn)</small><b>{money(d.stock_value)}</b></div>
          <h3>Sắp hết hàng</h3>
          {d.low_stock.length ? (
            d.low_stock.map((p) => (
              <div className="item row" key={p.id}>
                <span>{p.name}</span>
                <span className="badge warn">{num(p.stock)} {p.unit}</span>
              </div>
            ))
          ) : (
            <div className="empty">Không có</div>
          )}
        </>
      )}
    </>
  )
}
