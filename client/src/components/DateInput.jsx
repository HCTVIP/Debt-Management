import { useRef } from 'react'
import { dt } from '../utils'

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="16" rx="3" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
)

/**
 * Ô chọn ngày / tháng thống nhất trên mọi trình duyệt: chữ hiển thị theo định dạng Việt Nam (dd/mm/yyyy),
 * còn ô input gốc nằm trong suốt phủ lên trên để vẫn mở bộ chọn của điện thoại.
 * `display` ghi đè chữ hiển thị (ví dụ "Năm 2026").
 */
export default function DateInput({ type = 'date', value, onChange, display, placeholder = 'Chọn ngày' }) {
  const ref = useRef()
  const text = display || (value ? (type === 'month' ? 'Tháng ' + value.split('-').reverse().join('/') : dt(value)) : '')
  return (
    <div className="dfield">
      <span className={text ? '' : 'ph'}>{text || placeholder}</span>
      {value && (
        <button type="button" className="fx dfx" tabIndex={-1} aria-label="Xoá ngày" onClick={() => onChange('')}>
          ✕
        </button>
      )}
      <CalendarIcon />
      <input
        ref={ref}
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => {
          try {
            ref.current.showPicker?.()
          } catch {
            /* trình duyệt không cho mở tự động: người dùng bấm vào biểu tượng lịch */
          }
        }}
      />
    </div>
  )
}
