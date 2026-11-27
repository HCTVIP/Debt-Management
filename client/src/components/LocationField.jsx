import { memo, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { parseLatLng, placeNameFromLink } from '../utils'
import MapPicker from './MapPicker.jsx'

/**
 * Chọn một vị trí (điểm nhận / điểm giao) ngay trong ứng dụng, không mở tab mới.
 * Bấm Tìm: mở bản đồ (Google nếu có khoá trình duyệt, ngược lại OpenStreetMap) với địa chỉ đang nhập,
 * chọn điểm trên bản đồ để lấy địa chỉ và toạ độ. Dán link Google Maps hoặc toạ độ vào ô rồi bấm Tìm thì lấy luôn, không cần mở bản đồ.
 * `value` = { address, lat, lng }; `near` = toạ độ điểm còn lại để bản đồ mở gần đó.
 */
function LocationField({ label, value, onChange, near }) {
  const { run } = useApp()
  const [picking, setPicking] = useState(false)
  const has = value.lat != null && value.lng != null && value.lat !== '' && value.lng !== ''

  // Chữ đang gõ giữ ở đây, chỉ báo lên form cha sau khi dừng gõ ~0,25 giây (hoặc khi rời ô):
  // giữ phím xoá không làm cả form vẽ lại ở từng ký tự.
  const [typed, setTyped] = useState(value.address)
  const latest = useRef(value)
  latest.current = value
  const timer = useRef(null)
  useEffect(() => setTyped(value.address), [value.address])
  useEffect(() => () => clearTimeout(timer.current), [])
  const flush = (text) => {
    clearTimeout(timer.current)
    timer.current = null
    const v = latest.current
    if (text === v.address) return
    const hasLL = v.lat != null && v.lng != null && v.lat !== '' && v.lng !== ''
    onChange(hasLL ? { address: text, lat: null, lng: null } : { ...v, address: text })
  }

  const open = run(async () => {
    flush(typed)
    const text = typed.trim()
    // Link Google Maps (kể cả link rút gọn) hoặc toạ độ: lấy luôn
    let ll = parseLatLng(text)
    let link = text
    if (!ll && /^https:\/\//i.test(text)) {
      link = (await api('/maps/resolve?url=' + encodeURIComponent(text))).url
      ll = parseLatLng(link)
      if (!ll) throw new Error('Link này không có toạ độ')
    }
    if (ll) {
      const name = placeNameFromLink(link)
      const rev = name ? null : await api(`/maps/reverse?lat=${ll.lat}&lng=${ll.lng}`).catch(() => null)
      onChange({ address: name || rev?.address || `Vị trí ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`, lat: ll.lat, lng: ll.lng })
      return
    }
    setPicking(true)
  })

  return (
    <div className="locfield">
      <label>{label}</label>
      <div className="locrow">
        <input
          value={typed}
          placeholder="Nhập địa chỉ rồi bấm Tìm"
          onChange={(e) => {
            const text = e.target.value
            setTyped(text)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => flush(text), 250)
          }}
          onBlur={() => flush(typed)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault() // không lưu cả chuyến xe khi mới nhập địa chỉ
              open()
            }
          }}
        />
        <button type="button" className="btn sec sm" onClick={open}>Tìm</button>
      </div>
      {/* Luôn giữ một dòng để bố cục không nhảy khi toạ độ có / mất */}
      <div className="mut hint locinfo">
        {has ? `Đã có toạ độ: ${Number(value.lat).toFixed(5)}, ${Number(value.lng).toFixed(5)}` : typed ? 'Chưa có toạ độ. Bấm Tìm để chọn trên bản đồ.' : ' '}
      </div>
      {picking && (
        <MapPicker
          title={label}
          initial={{ ...value, address: typed }}
          near={near}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            onChange({ address: p.address, lat: p.lat, lng: p.lng })
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

export default memo(LocationField)
