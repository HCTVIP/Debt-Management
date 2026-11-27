import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { parseLatLng, placeNameFromLink } from '../utils'

/**
 * Chọn một vị trí (điểm nhận / điểm giao) ngay trong ứng dụng, không mở tab mới.
 * Nhập địa chỉ rồi bấm Tìm (hoặc Enter): máy chủ tìm bằng Google Maps (có khoá API) hoặc OpenStreetMap,
 * chọn một kết quả để lấy địa chỉ và toạ độ. Cũng có thể dán link Google Maps hoặc toạ độ vào ô rồi bấm Tìm.
 * `value` = { address, lat, lng }.
 */
export default function LocationField({ label, value, onChange }) {
  const { run, toast } = useApp()
  const [results, setResults] = useState([])
  const has = value.lat != null && value.lng != null && value.lat !== '' && value.lng !== ''

  const search = run(async () => {
    const text = value.address.trim()
    if (!text) throw new Error('Nhập địa chỉ cần tìm')
    // 1) Link Google Maps (kể cả link rút gọn) hoặc toạ độ
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
      setResults([])
      return
    }
    // 2) Tìm địa chỉ trên bản đồ
    const list = await api('/maps/geocode?address=' + encodeURIComponent(text))
    if (!list.length) throw new Error('Không tìm thấy địa chỉ này. Thử ghi thêm phường / quận / thành phố.')
    if (list.length === 1) {
      onChange(list[0])
      setResults([])
      if (list[0].approx) toast('Chỉ tìm được khu vực gần đúng, chưa có đúng số nhà / hẻm')
    } else setResults(list)
  })

  return (
    <div className="locfield">
      <label>{label}</label>
      <div className="locrow">
        <input
          value={value.address}
          placeholder="Nhập địa chỉ rồi bấm Tìm"
          onChange={(e) => {
            // đổi chữ thì toạ độ cũ không còn đúng
            onChange({ address: e.target.value, lat: null, lng: null })
            setResults([])
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault() // không lưu cả chuyến xe khi mới nhập địa chỉ
              search()
            }
          }}
        />
        <button type="button" className="btn sec sm" onClick={search}>Tìm</button>
      </div>
      {has && <div className="mut hint">Đã có toạ độ: {Number(value.lat).toFixed(5)}, {Number(value.lng).toFixed(5)}</div>}
      {!has && value.address && results.length === 0 && <div className="mut hint">Chưa có toạ độ. Bấm Tìm.</div>}
      {results.length > 0 && (
        <div className="pick">
          {results.map((r) => (
            <div
              key={r.address + r.lat}
              className="item link"
              onClick={() => {
                onChange(r)
                setResults([])
              }}
            >
              <div className="mut">{r.address}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
