import { money } from '../utils'

/** Rút gọn số tiền cho trục biểu đồ: 1,2 tỷ / 35 tr / 800k */
export const short = (n) => {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',').replace(',0', '') + ' tỷ'
  if (a >= 1e6) return Math.round(n / 1e6) + ' tr'
  if (a >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(Math.round(n))
}

// Làm tròn lên một giá trị "đẹp" (1, 2, 5 x 10^k) để chia trục đều
const niceMax = (v) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

const labelOf = (key, group) => {
  const [y, m, d] = key.split('-')
  return group === 'month' ? `T${Number(m)}/${y.slice(2)}` : `${Number(d)}/${Number(m)}`
}

/** Biểu đồ cột nhóm theo ngày hoặc tháng. `series`: [{ key, label, color }] */
export function BarChart({ data, series, group }) {
  const W = 340
  const H = 170
  const L = 38
  const B = 22
  const T = 8
  const R = 4
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key] || 0))))
  const iw = W - L - R
  const ih = H - T - B
  const gw = iw / Math.max(1, data.length)
  const bw = Math.min(16, (gw * 0.8) / series.length)
  const step = Math.ceil(data.length / 6)
  const y = (v) => T + ih - (v / max) * ih
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Biểu đồ cột">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={L - 4} y={y(max * t) + 3} fontSize="9" textAnchor="end" fill="#6b7280">{short(max * t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = L + i * gw + (gw - bw * series.length) / 2
          return (
            <g key={d.key}>
              {series.map((s, j) => {
                const v = d[s.key] || 0
                return v > 0 ? <rect key={s.key} x={x0 + j * bw} y={y(v)} width={bw - 1} height={T + ih - y(v)} rx="2" fill={s.color} /> : null
              })}
              {(i % step === 0 || i === data.length - 1) && (
                <text x={L + i * gw + gw / 2} y={H - 7} fontSize="9" textAnchor="middle" fill="#6b7280">{labelOf(d.key, group)}</text>
              )}
            </g>
          )
        })}
      </svg>
      <Legend items={series} />
    </div>
  )
}

export const Legend = ({ items }) => (
  <div className="legend">
    {items.map((s) => (
      <span key={s.key || s.label}><i style={{ background: s.color }} />{s.label}</span>
    ))}
  </div>
)

/** Biểu đồ tròn rỗng giữa. `parts`: [{ label, value, color }] */
export function Donut({ parts, center, sub }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const r = 52
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="Biểu đồ tròn">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef0f2" strokeWidth="20" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c
            const el = (
              <circle
                key={p.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="20"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 70 70)"
              />
            )
            acc += len
            return el
          })}
        <text x="70" y="68" textAnchor="middle" fontSize="20" fontWeight="700" fill="#1f2937">{center}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill="#6b7280">{sub}</text>
      </svg>
      <div className="dlist">
        {parts.map((p) => (
          <div key={p.label}>
            <span><i style={{ background: p.color }} />{p.label}</span>
            <b>{money(p.value)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Thanh ngang xếp hạng (top N). `rows`: [{ name, value }] */
export function HBar({ rows, color = 'var(--pri)' }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <div className="empty">Chưa có dữ liệu</div>
  return (
    <div className="hbar">
      {rows.map((r, i) => (
        <div key={r.name} className="hb">
          <div className="hb-top">
            <span className="hb-name"><em>{i + 1}</em>{r.name}</span>
            <b>{short(r.value)}</b>
          </div>
          <div className="hb-track"><div style={{ width: `${(r.value / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  )
}
