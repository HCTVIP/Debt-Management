import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useApp } from '../ctx'
import { createMap } from './mapEngine.js'

const HUE = { lat: 16.4637, lng: 107.5909 } // mặc định khi chưa có điểm nào: Huế

/**
 * Bản đồ toàn màn hình để chọn một vị trí ngay trong ứng dụng: gõ địa chỉ + Tìm, hoặc chạm lên bản đồ.
 * Bấm "Chọn vị trí này" để điền địa chỉ và toạ độ vào form.
 */
export default function MapPicker({ title, initial, near, onPick, onClose }) {
  const { toast } = useApp()
  const box = useRef()
  const mapRef = useRef(null)
  const [text, setText] = useState(initial.address || '')
  const [results, setResults] = useState([])
  const [chosen, setChosen] = useState(initial.lat != null && initial.lng != null ? initial : null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  // Chọn một điểm: đặt ghim, dời bản đồ tới đó
  const choose = (p, zoom) => {
    setChosen(p)
    mapRef.current?.setMarker(p.lat, p.lng)
    if (zoom) mapRef.current?.panTo(p.lat, p.lng, zoom)
  }

  // Chạm lên bản đồ: lấy địa chỉ của điểm đó
  const onMapClick = async (lat, lng) => {
    const id = ++seq.current
    setChosen({ address: 'Đang lấy địa chỉ...', lat, lng })
    mapRef.current?.setMarker(lat, lng)
    let address = ''
    try {
      address = (await api(`/maps/reverse?lat=${lat}&lng=${lng}`))?.address || ''
    } catch {
      /* không lấy được địa chỉ: vẫn dùng toạ độ */
    }
    if (id === seq.current) setChosen({ address: address || `Vị trí ${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng })
  }

  const search = async (q = text) => {
    const query = q.trim()
    if (query.length < 3) return toast('Nhập địa chỉ (ít nhất 3 ký tự)')
    setBusy(true)
    try {
      const list = await api('/maps/geocode?address=' + encodeURIComponent(query))
      if (!list.length) {
        setResults([])
        toast('Không tìm thấy địa chỉ này. Thử ghi thêm phường / quận / thành phố, hoặc chạm trực tiếp lên bản đồ.')
        return
      }
      if (list[0].approx) toast('Chỉ tìm được khu vực gần đúng, hãy chạm lên bản đồ để chọn đúng điểm')
      setResults(list.length > 1 ? list : [])
      choose(list[0], 16)
    } catch (e) {
      toast(e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let dead = false
    ;(async () => {
      const status = await api('/maps/status').catch(() => ({}))
      const start = chosen || near || HUE
      const { map, note: n } = await createMap(box.current, {
        browserKey: status.browserKey,
        center: { lat: start.lat, lng: start.lng },
        zoom: chosen ? 16 : near ? 13 : 12,
        onClick: onMapClick
      })
      if (dead) return map.destroy()
      mapRef.current = map
      setNote(n)
      if (chosen) map.setMarker(chosen.lat, chosen.lng)
      else if (text.trim().length >= 3) search(text) // đã gõ sẵn địa chỉ: tìm luôn khi mở bản đồ
    })().catch((e) => toast(e.message))
    return () => {
      dead = true
      mapRef.current?.destroy()
      mapRef.current = null
    }
  }, [])

  return createPortal(
    <div className="mapov" role="dialog" aria-label={title}>
      <div className="maptop">
        <button type="button" className="mapx" onClick={onClose} aria-label="Đóng">✕</button>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            search()
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={title + ': nhập địa chỉ rồi bấm Tìm'} />
          <button className="btn sm" disabled={busy}>Tìm</button>
        </form>
      </div>
      {results.length > 0 && (
        <div className="maplist">
          {results.map((r) => (
            <div key={r.address + r.lat} className="item link" onClick={() => (choose(r, 16), setResults([]))}>
              <div className="mut">{r.address}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mapview" ref={box} />
      {note && <div className="mapnote">{note}</div>}
      <div className="mapbottom">
        <div className="mapaddr">{chosen ? chosen.address : 'Chạm lên bản đồ hoặc tìm địa chỉ để chọn vị trí'}</div>
        <button type="button" className="btn" disabled={!chosen || chosen.address === 'Đang lấy địa chỉ...'} onClick={() => onPick(chosen)}>
          Chọn vị trí này
        </button>
      </div>
    </div>,
    document.body
  )
}
