import { useLayoutEffect, useRef, useState } from 'react'

// Ô nhập / danh sách chọn / ô văn bản dài có nút ✕ để xoá nhanh. Dùng thay cho <input> <select> <textarea> trong toàn app.
// Nút ✕ chỉ hiện khi ô có dữ liệu (và danh sách chọn có lựa chọn rỗng); bấm vào sẽ xoá và báo cho React như người dùng tự xoá.

const CLEARABLE = new Set([undefined, 'text', 'search', 'tel', 'email', 'url', 'password', 'number'])

// Đặt giá trị rỗng bằng setter gốc rồi bắn sự kiện, để ô điều khiển bởi React nhận được thay đổi
const setNative = (el, proto, event) => {
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, '')
  el.dispatchEvent(new Event(event, { bubbles: true }))
}

/** Vị trí nút ✕ tính từ chính ô nhập (không phụ thuộc lề của từng màn hình). `endGap` = khoảng chừa ở mép phải (nút mắt, mũi tên...). */
function useXPos(ref, active, endGap) {
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!active || !el) {
      if (pos) setPos(null)
      return
    }
    const top = el.offsetTop + (el.tagName === 'TEXTAREA' ? 18 : el.offsetHeight / 2)
    const left = el.offsetLeft + el.offsetWidth - endGap - 12
    if (!pos || pos.top !== top || pos.left !== left) setPos({ top, left })
  })
  return pos
}

const XButton = ({ pos, onClear }) =>
  pos && (
    <button
      type="button"
      className="fx"
      tabIndex={-1}
      aria-label="Xoá"
      style={{ top: pos.top, left: pos.left }}
      // giữ nguyên tiêu điểm để bàn phím không bị đóng
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={onClear}
    >
      ✕
    </button>
  )

const join = (...c) => c.filter(Boolean).join(' ')

export function Input({ endGap = 10, noClear, className, ...props }) {
  const ref = useRef()
  const show = !noClear && !props.readOnly && !props.disabled && CLEARABLE.has(props.type) && String(props.value ?? '') !== ''
  const pos = useXPos(ref, show, endGap)
  const clear = () => {
    setNative(ref.current, HTMLInputElement, 'input')
    ref.current.focus()
  }
  return (
    <span className="fw">
      <input ref={ref} className={join(className, show && 'hasx')} {...props} />
      <XButton pos={pos} onClear={clear} />
    </span>
  )
}

export function Textarea({ noClear, className, ...props }) {
  const ref = useRef()
  const show = !noClear && !props.readOnly && !props.disabled && String(props.value ?? '') !== ''
  const pos = useXPos(ref, show, 10)
  const clear = () => {
    setNative(ref.current, HTMLTextAreaElement, 'input')
    ref.current.focus()
  }
  return (
    <span className="fw">
      <textarea ref={ref} className={join(className, show && 'hasx')} {...props} />
      <XButton pos={pos} onClear={clear} />
    </span>
  )
}

/** Danh sách chọn: chỉ có ✕ khi có lựa chọn rỗng (value="") để quay về. */
export function Select({ children, noClear, className, ...props }) {
  const ref = useRef()
  const [hasEmpty, setHasEmpty] = useState(false)
  useLayoutEffect(() => {
    const e = ref.current
    if (!e) return
    const v = [...e.options].some((o) => o.value === '')
    setHasEmpty((p) => (p === v ? p : v))
  })
  const show = !noClear && !props.disabled && hasEmpty && String(props.value ?? '') !== ''
  const pos = useXPos(ref, show, 30)
  const clear = () => setNative(ref.current, HTMLSelectElement, 'change')
  return (
    <span className="fw">
      <select ref={ref} className={join(className, show && 'hasx')} {...props}>
        {children}
      </select>
      <XButton pos={pos} onClear={clear} />
    </span>
  )
}
