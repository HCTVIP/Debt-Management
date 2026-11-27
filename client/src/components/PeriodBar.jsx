import { useApp } from '../ctx'
import DateInput from './DateInput.jsx'

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
    <div className="pbar">
      <div className="seg">
        {MODES.map(([k, l]) => (
          <button key={k} className={p.mode === k ? 'on' : ''} onClick={() => set({ mode: k })}>{l}</button>
        ))}
      </div>
      {p.mode === 'month' && <DateInput type="month" value={p.month} onChange={(v) => v && set({ month: v })} />}
      {p.mode === 'year' && (
        // Chọn một ngày bất kỳ: bộ lọc lấy theo năm của ngày đó
        <DateInput value={`${p.year}-01-01`} display={`Năm ${p.year}`} onChange={(v) => v && set({ year: v.slice(0, 4) })} />
      )}
      {p.mode === 'range' && (
        <div className="grid2">
          <div>
            <label>Từ ngày</label>
            <DateInput value={p.from} placeholder="Từ ngày" onChange={(v) => setRange({ from: v })} />
          </div>
          <div>
            <label>Đến ngày</label>
            <DateInput value={p.to} placeholder="Đến ngày" onChange={(v) => setRange({ to: v })} />
          </div>
        </div>
      )}
    </div>
  )
}
