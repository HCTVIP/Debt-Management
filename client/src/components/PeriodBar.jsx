import { useApp } from '../ctx'

const MODES = [['month', 'Tháng'], ['year', 'Năm'], ['range', 'Khoảng ngày']]

/** Bộ lọc kỳ dùng chung: tháng / năm / khoảng ngày. */
export default function PeriodBar() {
  const { period: p, setPeriod, toast } = useApp()
  const set = (patch) => setPeriod({ ...p, ...patch })
  const setRange = (patch) => {
    const next = { ...p, ...patch }
    if (next.from && next.to && next.from > next.to) return toast('Từ ngày phải trước đến ngày')
    setPeriod(next)
  }
  return (
    <div>
      <div className="seg">
        {MODES.map(([k, l]) => (
          <button key={k} className={p.mode === k ? 'on' : ''} onClick={() => set({ mode: k })}>{l}</button>
        ))}
      </div>
      {p.mode === 'month' && <input type="month" value={p.month} onChange={(e) => e.target.value && set({ month: e.target.value })} />}
      {p.mode === 'year' && (
        <>
          {/* Chọn một ngày bất kỳ: bộ lọc lấy theo năm của ngày đó */}
          <input type="date" value={`${p.year}-01-01`} onChange={(e) => e.target.value && set({ year: e.target.value.slice(0, 4) })} />
          <div className="mut hint">Cả năm {p.year}</div>
        </>
      )}
      {p.mode === 'range' && (
        <div className="grid2">
          <div>
            <label>Từ ngày</label>
            <input type="date" value={p.from} onChange={(e) => setRange({ from: e.target.value })} />
          </div>
          <div>
            <label>Đến ngày</label>
            <input type="date" value={p.to} onChange={(e) => setRange({ to: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  )
}
