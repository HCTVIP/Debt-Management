import FilterBar, { useDateDraft } from '../components/FilterBar.jsx'
import { Page, Status } from '../components/Bits.jsx'
import { BarChart, Donut, HBar, short } from '../components/Charts.jsx'
import { useApp, useData } from '../ctx'
import { money, periodQS } from '../utils'

/** Tổng quan: chỉ xem (biểu đồ + số liệu), không có thao tác thêm / sửa. */
export default function Home() {
  const { period } = useApp()
  const dates = useDateDraft()
  const st = useData(['/dashboard?' + periodQS(period)])
  const d = st.data?.[0]
  const hasSpent = d && d.spent > 0
  const bars = [
    { key: 'sold', label: 'Bán hàng', color: '#c4161c' },
    { key: 'collected', label: 'Đã thu', color: '#16a34a' },
    ...(hasSpent ? [{ key: 'spent', label: 'Chi', color: '#eeb919' }] : [])
  ]
  const paid = d ? Math.max(0, d.sold - d.receivable) : 0
  return (
    <Page filters={<FilterBar dates={dates} onSubmit={dates.commit} />}>
      <Status state={st} />
      {d && (
        <>
          <div className="grid2 kpis">
            <div className="card stat"><small>Bán hàng</small><b>{money(d.sold)}</b></div>
            <div className="card stat"><small>Đã thu từ khách</small><b className="grn">{money(d.collected)}</b></div>
            <div className="card stat"><small>Khách còn nợ</small><b className="red">{money(d.receivable)}</b></div>
            <div className="card stat"><small>Chi</small><b>{money(d.spent)}</b></div>
            <div className="card stat"><small>Tổng số khách hàng</small><b>{d.customers}</b></div>
          </div>

          <div className="card">
            <h3 className="ctitle">Bán hàng và thu tiền theo {d.group === 'month' ? 'tháng' : 'ngày'}</h3>
            {d.series.length ? <BarChart data={d.series} series={bars} group={d.group} /> : <div className="empty">Chưa có dữ liệu</div>}
          </div>

          <div className="card">
            <h3 className="ctitle">Tỷ lệ thu tiền của các đơn trong kỳ</h3>
            <Donut
              parts={[
                { label: 'Đã thu', value: paid, color: '#16a34a' },
                { label: 'Còn nợ', value: d.receivable, color: '#c4161c' }
              ]}
              center={d.sold > 0 ? Math.round((paid / d.sold) * 100) + '%' : '0%'}
              sub={'của ' + short(d.sold)}
            />
          </div>

          <div className="card">
            <h3 className="ctitle">Top 5 khách hàng (doanh số)</h3>
            <HBar rows={d.top_customers} />
          </div>

          <div className="card">
            <h3 className="ctitle">Top 5 hàng hóa (doanh thu)</h3>
            <HBar rows={d.top_products} color="#eeb919" />
          </div>
        </>
      )}
    </Page>
  )
}
