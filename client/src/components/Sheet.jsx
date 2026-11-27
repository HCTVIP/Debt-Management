import { useRef, useState } from 'react'

/**
 * Bottom sheet kiểu Facebook: trượt lên, có thanh nắm, kéo xuống để đóng, bấm nền mờ để đóng.
 */
export default function Sheet({ onClose, children }) {
  const [closing, setClosing] = useState(false)
  const [dy, setDy] = useState(0)
  const start = useRef(null)

  const close = () => {
    setClosing(true)
    setTimeout(onClose, 180)
  }
  const down = (e) => (start.current = e.touches[0].clientY)
  const move = (e) => {
    if (start.current == null) return
    setDy(Math.max(0, e.touches[0].clientY - start.current))
  }
  const up = () => {
    if (dy > 110) close()
    else setDy(0)
    start.current = null
  }
  return (
    <div className={'sheet-bg' + (closing ? ' closing' : '')} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="grabber" onTouchStart={down} onTouchMove={move} onTouchEnd={up}>
          <span />
        </div>
        {children}
      </div>
    </div>
  )
}
