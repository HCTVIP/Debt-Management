import { useEffect, useRef, useState } from 'react'
import { useApp } from '../ctx'
import { useLinks } from '../links'
import { dt, money } from '../utils'

/** Khung chờ (skeleton) thay cho chữ "Đang tải..." */
export const Skeleton = ({ rows = 6 }) => (
  <div aria-busy="true" aria-label="Đang tải">
    {Array.from({ length: rows }, (_, i) => (
      <div className="item sk" key={i}>
        <div className="sk-av" />
        <div className="sk-lines">
          <div className="sk-l" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
          <div className="sk-l short" />
        </div>
      </div>
    ))}
  </div>
)

export const Status = ({ state }) => (state.loading && !state.data ? <Skeleton /> : state.error ? <div className="state red">{state.error.message}</div> : null)

export const Fab = ({ onClick }) => <button className="fab" onClick={onClick} aria-label="Thêm mới">+</button>

export const Seg = ({ value, onChange, options }) => (
  <div className="seg">
    {options.map(([k, l]) => (
      <button type="button" key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
    ))}
  </div>
)

/** Chữ bấm được (không kích hoạt thẻ cha). */
export const Lnk = ({ onClick, children }) => (
  <span
    className="lnk"
    onClick={(e) => {
      e.stopPropagation()
      onClick()
    }}
  >
    {children}
  </span>
)

const AV_COLORS = ['#c4161c', '#d97706', '#0f766e', '#2563eb', '#7c3aed', '#be185d', '#4d7c0f', '#0e7490']
const initials = (name = '') => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase()
}

/** Ảnh đại diện tròn bằng chữ cái đầu, màu theo tên (giống avatar mặc định của Facebook). */
export const Avatar = ({ name, size = 44 }) => {
  let h = 0
  for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <div className="avatar" style={{ width: size, height: size, background: AV_COLORS[h % AV_COLORS.length], fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </div>
  )
}

export const OrderRow = ({ o }) => {
  const { openOrder, openPartner } = useLinks()
  return (
    <div className="item link orow" onClick={() => openOrder(o.id)}>
      <Avatar name={o.partner_name} />
      <div className="obody">
        <div className="row">
          <span className="t"><Lnk onClick={() => openPartner(o.partner_id)}>{o.partner_name}</Lnk></span>
          <b className="nw">{money(o.total)}</b>
        </div>
        <div className="row mut">
          <span>{o.code} · {dt(o.order_date)}</span>
          {Number(o.debt) > 0 ? <span className="red nw">Nợ {money(o.debt)}</span> : <span className="grn nw">Đã thanh toán</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Hiển thị danh sách dài theo từng đợt (cuộn gần cuối thì tải thêm), tránh dựng hàng trăm dòng một lúc.
 * Trả về [phần đang hiển thị, phần tử mốc đặt cuối danh sách].
 */
export function useChunk(list, step = 30) {
  const [n, setN] = useState(step)
  const mark = useRef()
  useEffect(() => setN(step), [list, step])
  useEffect(() => {
    const el = mark.current
    if (!el || n >= list.length) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setN((x) => x + step), { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [n, list, step])
  return [list.slice(0, n), <div key="mark" ref={mark} style={{ height: 1 }} />]
}

/**
 * Khung trang: bộ lọc cố định ở đầu, chỉ danh sách bên dưới cuộn.
 * Kéo xuống khi đang ở đầu danh sách để làm mới (pull to refresh).
 */
export const Page = ({ filters, children }) => {
  const { reload } = useApp()
  const ref = useRef()
  const y0 = useRef(null)
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const THRESHOLD = 64

  const onStart = (e) => {
    y0.current = ref.current.scrollTop <= 0 ? e.touches[0].clientY : null
  }
  const onMove = (e) => {
    if (y0.current == null || busy) return
    const d = e.touches[0].clientY - y0.current
    setPull(d > 0 ? Math.min(d * 0.5, 90) : 0)
  }
  const onEnd = () => {
    if (pull >= THRESHOLD && !busy) {
      setBusy(true)
      reload()
      setTimeout(() => setBusy(false), 900)
    }
    setPull(0)
    y0.current = null
  }
  const shown = busy ? 44 : pull
  return (
    <>
      <div className="pfilters">{filters}</div>
      <div className="plist" ref={ref} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        <div className="ptr" style={{ height: shown }}>
          {shown > 0 && <span className={'spin' + (busy ? ' busy' : '')} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / THRESHOLD) }} />}
        </div>
        {children}
      </div>
    </>
  )
}
