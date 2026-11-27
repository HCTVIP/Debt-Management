import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { useLinks } from '../links'
import { SHIP_STATUS, dt, km, mapsRouteLink, money, straightKm, today } from '../utils'
import { Lnk } from './Bits.jsx'
import DateInput from './DateInput.jsx'
import LocationField from './LocationField.jsx'
import ProofPhotos from './ProofPhotos.jsx'

const PICKUP_KEY = 'pickup_default'
const loadPickup = () => {
  try {
    return JSON.parse(localStorage.getItem(PICKUP_KEY)) || null
  } catch {
    return null
  }
}
const emptyLoc = { address: '', lat: null, lng: null }
const hasLL = (p) => p.lat != null && p.lng != null && p.lat !== '' && p.lng !== ''

/** Thêm / sửa một chuyến xe: đơn hàng, xe, điểm nhận và điểm giao (Google Maps), khoảng cách, ảnh xác nhận giao hàng. */
export default function ShipmentForm({ shipment, order, close }) {
  const { run, reload, toast } = useApp()
  const { openOrder, openPartner } = useLinks()
  const s = shipment || {}
  const [f, setF] = useState({ ship_date: s.ship_date || today(), vehicle: s.vehicle || '', driver: s.driver || '', fee: s.fee ?? 0, status: s.status || 'pending', note: s.note || '' })
  const [ord, setOrd] = useState(order || s.orders ? { id: order?.id || s.order_id, code: order?.code || s.orders.code, partner_id: order?.partner_id || s.orders.partner_id, partner_name: order?.partner_name || s.orders.partners?.name, order_date: order?.order_date || s.orders.order_date } : null)
  // Điểm nhận mặc định = điểm nhận của chuyến trước (lưu trong trình duyệt)
  const [pickup, setPickup] = useState(s.id ? { address: s.pickup_address || '', lat: s.pickup_lat, lng: s.pickup_lng } : loadPickup() || emptyLoc)
  const [delivery, setDelivery] = useState({ address: s.delivery_address || '', lat: s.delivery_lat, lng: s.delivery_lng })
  const [dist, setDist] = useState({ km: s.distance_km ?? null, min: s.duration_min ?? null, method: s.distance_km != null ? 'saved' : null })
  const [pending, setPending] = useState([])
  const [mapsEnabled, setMapsEnabled] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    api('/maps/status').then((r) => setMapsEnabled(!!r.enabled)).catch(() => {})
  }, [])

  // Chuyến mới: điền sẵn địa chỉ giao theo địa chỉ khách hàng của đơn
  useEffect(() => {
    if (s.id || !ord?.partner_id || delivery.address) return
    api('/partners/' + ord.partner_id)
      .then((p) => p.address && setDelivery((d) => (d.address ? d : { address: p.address, lat: null, lng: null })))
      .catch(() => {})
  }, [ord?.partner_id])

  // Tìm đơn để gắn chuyến (khi chưa chọn đơn)
  useEffect(() => {
    if (ord) return
    const t = setTimeout(() => {
      api('/orders?type=out&limit=30&q=' + encodeURIComponent(q)).then(setFound).catch(() => setFound([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q, ord])

  // Đổi điểm nhận / giao thì khoảng cách cũ không còn đúng
  const changePickup = (v) => (setPickup(v), setDist({ km: null, min: null, method: null }))
  const changeDelivery = (v) => (setDelivery(v), setDist({ km: null, min: null, method: null }))

  const calc = run(async () => {
    if (!hasLL(pickup) || !hasLL(delivery)) throw new Error('Cần có toạ độ cả điểm nhận và điểm giao. Bấm Tìm ở từng điểm.')
    const r = await api(`/maps/route?from_lat=${pickup.lat}&from_lng=${pickup.lng}&to_lat=${delivery.lat}&to_lng=${delivery.lng}`)
    setDist({ km: r.distance_km, min: r.duration_min, method: r.method })
    if (r.warning) toast('Không lấy được đường đi, dùng đường chim bay: ' + r.warning)
  })

  const submit = run(async (e) => {
    e.preventDefault()
    if (!ord) throw new Error('Chọn đơn hàng')
    // Có đủ toạ độ mà chưa tính khoảng cách thì tự tính đường chim bay để không bỏ trống
    let d = dist
    if (d.km == null && hasLL(pickup) && hasLL(delivery)) d = { km: straightKm(pickup, delivery), min: null, method: 'straight' }
    const body = {
      ...f,
      order_id: ord.id,
      delivered_at: s.delivered_at,
      pickup_address: pickup.address,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      delivery_address: delivery.address,
      delivery_lat: delivery.lat,
      delivery_lng: delivery.lng,
      distance_km: d.km,
      duration_min: d.min
    }
    const saved = s.id ? await api('/shipments/' + s.id, 'PUT', body) : await api('/shipments', 'POST', body)
    try {
      if (pickup.address) localStorage.setItem(PICKUP_KEY, JSON.stringify(pickup))
    } catch {
      /* không lưu được điểm nhận mặc định: bỏ qua */
    }
    // Ảnh của chuyến mới: tải lên sau khi chuyến đã có id
    for (const data of pending) await api(`/shipments/${saved.id}/proofs`, 'POST', { data })
    close()
    reload()
  })
  const del = run(async () => {
    if (!confirm('Xoá chuyến xe này?')) return
    await api('/shipments/' + s.id, 'DELETE')
    close()
    reload()
  })

  const canRoute = hasLL(pickup) && hasLL(delivery)
  return (
    <form onSubmit={submit}>
      <h2>{s.id ? 'Sửa chuyến xe' : 'Thêm chuyến xe'}</h2>
      <label>Đơn hàng</label>
      {ord ? (
        <div className="card row">
          <span><Lnk onClick={() => openOrder(ord.id)}>{ord.code}</Lnk> · <Lnk onClick={() => openPartner(ord.partner_id)}>{ord.partner_name}</Lnk></span>
          {!s.id && !order && <button type="button" className="btn sec sm" onClick={() => setOrd(null)}>Đổi</button>}
        </div>
      ) : (
        <>
          <input placeholder="Tìm mã đơn / tên khách" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pick">
            {found.map((o) => (
              <div key={o.id} className="item link" onClick={() => setOrd(o)}>
                <div className="row"><span className="t">{o.partner_name}</span><b>{money(o.total)}</b></div>
                <div className="mut">{o.code} · {dt(o.order_date)}</div>
              </div>
            ))}
            {!found.length && <div className="state">Không có đơn</div>}
          </div>
        </>
      )}
      <div className="grid2">
        <div>
          <label>Ngày</label>
          <DateInput value={f.ship_date} onChange={(v) => setF({ ...f, ship_date: v })} />
        </div>
        <div>
          <label>Trạng thái</label>
          <select value={f.status} onChange={set('status')}>
            {Object.entries(SHIP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label>Biển số xe</label>
          <input value={f.vehicle} onChange={set('vehicle')} />
        </div>
        <div>
          <label>Tài xế</label>
          <input value={f.driver} onChange={set('driver')} />
        </div>
      </div>

      <LocationField label="Điểm nhận hàng" value={pickup} onChange={changePickup} mapsEnabled={mapsEnabled} />
      <LocationField label="Điểm giao hàng" value={delivery} onChange={changeDelivery} mapsEnabled={mapsEnabled} />
      {!mapsEnabled && <div className="mut hint">Chưa bật tìm địa chỉ bằng Google Maps (cần GOOGLE_MAPS_API_KEY). Vẫn dán được link Google Maps hoặc toạ độ.</div>}

      <div className="distbox">
        <div>
          <small>Khoảng cách</small>
          <b>{dist.km != null ? km(dist.km) : '---'}</b>
          {dist.min != null && <span className="mut"> · {dist.min} phút</span>}
          {dist.method === 'straight' && <div className="mut hint">Đường chim bay (không phải đường đi)</div>}
          {dist.method === 'road' && <div className="mut hint">Theo đường đi (Google Maps)</div>}
        </div>
        <div className="distbtns">
          <button type="button" className="btn sec sm" onClick={calc} disabled={!canRoute}>Tính khoảng cách</button>
          {canRoute && <a className="btn sec sm" href={mapsRouteLink(pickup, delivery)} target="_blank" rel="noreferrer">Chỉ đường</a>}
        </div>
      </div>

      <label>Cước vận chuyển</label>
      <input type="number" inputMode="decimal" min="0" step="any" value={f.fee} onChange={set('fee')} />
      <label>Ghi chú</label>
      <input value={f.note} onChange={set('note')} />

      <ProofPhotos shipmentId={s.id} pending={pending} setPending={setPending} />

      <div className="acts">
        {s.id && <button type="button" className="btn dan" onClick={del}>Xoá</button>}
        <button className="btn">Lưu</button>
      </div>
    </form>
  )
}
