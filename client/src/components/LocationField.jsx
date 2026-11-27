import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { mapsPlaceLink, parseLatLng } from '../utils'

/**
 * Chọn một vị trí (điểm nhận / điểm giao): nhập địa chỉ, tìm bằng Google Maps, dán link Google Maps hoặc toạ độ,
 * hoặc lấy vị trí hiện tại. `value` = { address, lat, lng }.
 */
export default function LocationField({ label, value, onChange, mapsEnabled }) {
  const { run, toast } = useApp()
  const [results, setResults] = useState([])
  const has = value.lat != null && value.lng != null && value.lat !== '' && value.lng !== ''

  const set = (patch) => onChange({ ...value, ...patch })
  const reverse = async (lat, lng) => {
    if (!mapsEnabled) return null
    try {
      return (await api(`/maps/reverse?lat=${lat}&lng=${lng}`))?.address || null
    } catch {
      return null
    }
  }

  // Dán link Google Maps (kể cả link rút gọn) hoặc toạ độ, hoặc tìm địa chỉ bằng Google Maps
  const search = run(async () => {
    const text = value.address.trim()
    if (!text) throw new Error('Nhập địa chỉ hoặc dán link Google Maps')
    let ll = parseLatLng(text)
    if (!ll && /^https:\/\//i.test(text)) {
      const r = await api('/maps/resolve?url=' + encodeURIComponent(text))
      ll = parseLatLng(r.url)
      if (!ll) throw new Error('Link này không có toạ độ')
    }
    if (ll) {
      const address = await reverse(ll.lat, ll.lng)
      onChange({ address: address || `Vị trí ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`, lat: ll.lat, lng: ll.lng })
      setResults([])
      return
    }
    if (!mapsEnabled) throw new Error('Chưa cấu hình Google Maps trên máy chủ. Hãy dán link Google Maps hoặc toạ độ.')
    const list = await api('/maps/geocode?address=' + encodeURIComponent(text))
    if (!list.length) toast('Không tìm thấy địa chỉ này')
    if (list.length === 1) onChange({ address: list[0].address, lat: list[0].lat, lng: list[0].lng })
    setResults(list.length === 1 ? [] : list)
  })

  const here = run(
    () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Thiết bị không hỗ trợ định vị'))
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords
            const address = await reverse(lat, lng)
            onChange({ address: address || `Vị trí hiện tại ${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng })
            setResults([])
            resolve()
          },
          () => reject(new Error('Không lấy được vị trí. Hãy cho phép truy cập vị trí cho trang web.')),
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })
  )

  return (
    <div className="locfield">
      <label>{label}</label>
      <input
        value={value.address}
        placeholder="Địa chỉ, link Google Maps hoặc toạ độ"
        onChange={(e) => {
          // đổi chữ thì toạ độ cũ không còn đúng
          onChange({ address: e.target.value, lat: null, lng: null })
          setResults([])
        }}
      />
      <div className="locbtns">
        <button type="button" className="btn sec sm" onClick={search}>Tìm</button>
        <button type="button" className="btn sec sm" onClick={here}>Vị trí hiện tại</button>
        {(has || value.address) && (
          <a className="btn sec sm" href={mapsPlaceLink(value)} target="_blank" rel="noreferrer">Mở Google Maps</a>
        )}
        {has && <button type="button" className="btn sec sm" onClick={() => set({ lat: null, lng: null })}>Bỏ toạ độ</button>}
      </div>
      {has ? (
        <div className="mut hint">Toạ độ: {Number(value.lat).toFixed(5)}, {Number(value.lng).toFixed(5)}</div>
      ) : (
        value.address && <div className="mut hint">Chưa có toạ độ. Bấm Tìm để lấy từ Google Maps.</div>
      )}
      {results.length > 0 && (
        <div className="pick">
          {results.map((r) => (
            <div key={r.address + r.lat} className="item link" onClick={() => (onChange(r), setResults([]))}>
              <div className="mut">{r.address}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
