import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { mapsPlaceLink, parseLatLng, placeNameFromLink } from '../utils'

// Mở Google Maps ở vị trí hiện tại của máy (không chỉ định điểm)
const MAPS_HERE = 'https://www.google.com/maps/@?api=1&map_action=map'
const mapsSearch = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)

/**
 * Chọn một vị trí (điểm nhận / điểm giao) bằng ứng dụng Google Maps:
 *  1. Bấm Tìm hoặc Vị trí hiện tại -> mở Google Maps.
 *  2. Trong Google Maps chọn điểm -> Chia sẻ -> Sao chép liên kết.
 *  3. Quay lại đây: ứng dụng tự đọc liên kết vừa sao chép (hoặc bấm Dán) để lấy địa chỉ và toạ độ.
 * Cũng có thể dán trực tiếp link Google Maps hoặc toạ độ vào ô địa chỉ rồi bấm Tìm.
 * `value` = { address, lat, lng }.
 */
export default function LocationField({ label, value, onChange, mapsEnabled }) {
  const { run, toast } = useApp()
  const [waiting, setWaiting] = useState(false)
  const lastApplied = useRef('')
  const has = value.lat != null && value.lng != null && value.lat !== '' && value.lng !== ''

  const reverse = async (lat, lng) => {
    if (!mapsEnabled) return null
    try {
      return (await api(`/maps/reverse?lat=${lat}&lng=${lng}`))?.address || null
    } catch {
      return null
    }
  }

  // Đọc chữ (link Google Maps, link rút gọn hoặc toạ độ) và áp dụng vào ô này. Trả về true nếu lấy được toạ độ.
  const applyText = async (raw) => {
    const text = String(raw || '').trim()
    if (!text) return false
    let ll = parseLatLng(text)
    let link = text
    if (!ll && /^https:\/\//i.test(text)) {
      const r = await api('/maps/resolve?url=' + encodeURIComponent(text))
      link = r.url
      ll = parseLatLng(link)
    }
    if (!ll) return false
    const address = placeNameFromLink(link) || (await reverse(ll.lat, ll.lng)) || `Vị trí ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`
    lastApplied.current = text
    onChange({ address, lat: ll.lat, lng: ll.lng })
    return true
  }

  const openMaps = (url) => {
    window.open(url, '_blank', 'noopener')
    setWaiting(true)
  }

  // Tìm: link / toạ độ trong ô thì dùng luôn, còn lại mở Google Maps tìm địa chỉ đang nhập
  const search = run(async () => {
    const text = value.address.trim()
    if (text && (await applyText(text))) return
    openMaps(text ? mapsSearch(text) : MAPS_HERE)
  })

  // Dán từ bộ nhớ tạm (có thao tác bấm nên điện thoại cho phép đọc)
  const paste = run(async () => {
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      throw new Error('Không đọc được bộ nhớ tạm. Hãy nhấn giữ ô địa chỉ và chọn Dán.')
    }
    if (!(await applyText(text))) throw new Error('Chưa thấy liên kết Google Maps trong bộ nhớ tạm. Trong Google Maps hãy Chia sẻ → Sao chép liên kết.')
    setWaiting(false)
    toast('Đã lấy vị trí từ Google Maps')
  })

  // Quay lại từ Google Maps: tự đọc liên kết vừa sao chép (nếu trình duyệt cho phép)
  useEffect(() => {
    if (!waiting) return
    const back = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const text = await navigator.clipboard.readText()
        if (text && text.trim() !== lastApplied.current && (await applyText(text))) {
          setWaiting(false)
          toast('Đã lấy vị trí từ Google Maps')
        }
      } catch {
        /* chưa được phép đọc bộ nhớ tạm: người dùng bấm Dán */
      }
    }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('focus', back)
    }
  }, [waiting])

  return (
    <div className="locfield">
      <label>{label}</label>
      <input
        value={value.address}
        placeholder="Địa chỉ, link Google Maps hoặc toạ độ"
        onChange={(e) => {
          // đổi chữ thì toạ độ cũ không còn đúng
          onChange({ address: e.target.value, lat: null, lng: null })
        }}
      />
      <div className="locbtns">
        <button type="button" className="btn sec sm" onClick={search}>Tìm</button>
        <button type="button" className="btn sec sm" onClick={() => openMaps(MAPS_HERE)}>Vị trí hiện tại</button>
        <button type="button" className="btn sec sm" onClick={paste}>Dán</button>
        {(has || value.address) && (
          <a className="btn sec sm" href={mapsPlaceLink(value)} target="_blank" rel="noreferrer">Mở Google Maps</a>
        )}
        {has && <button type="button" className="btn sec sm" onClick={() => onChange({ ...value, lat: null, lng: null })}>Bỏ toạ độ</button>}
      </div>
      {waiting && (
        <div className="waitbox">
          Đang chờ Google Maps: chọn điểm → <b>Chia sẻ</b> → <b>Sao chép liên kết</b>, rồi quay lại đây. Nếu chưa tự điền, bấm <b>Dán</b>.
          <button type="button" aria-label="Đóng" onClick={() => setWaiting(false)}>✕</button>
        </div>
      )}
      {has ? (
        <div className="mut hint">Toạ độ: {Number(value.lat).toFixed(5)}, {Number(value.lng).toFixed(5)}</div>
      ) : (
        value.address && !waiting && <div className="mut hint">Chưa có toạ độ. Bấm Tìm để chọn trong Google Maps.</div>
      )}
    </div>
  )
}
