export const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫'
export const num = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(n) || 0)
export const dt = (d) => (d ? d.split('-').reverse().join('/') : '---')
// Ngày theo giờ máy (không dùng UTC để tránh lệch ngày ở Việt Nam)
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const today = () => iso(new Date())

/** Kỳ lọc mặc định: từ đầu tháng này đến hôm nay. */
export const defaultPeriod = () => {
  const n = new Date()
  return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(n) }
}

/** Mỗi lần mở app luôn bắt đầu từ đầu tháng hiện tại đến hôm nay (không nhớ bộ lọc lần trước). */
export const loadPeriod = () => defaultPeriod()

export const periodQS = (p) => [p.from && 'from=' + p.from, p.to && 'to=' + p.to].filter(Boolean).join('&')

export const qs = (...parts) => parts.filter(Boolean).join('&')

export const SHIP_STATUS = { pending: 'Chờ giao', shipping: 'Đang giao', delivered: 'Đã giao' }

/** Đọc file ảnh thành đối tượng vẽ được lên canvas. Ưu tiên createImageBitmap (tự xoay theo EXIF), dự phòng bằng thẻ img. */
const decodeImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* định dạng không hỗ trợ: thử cách dự phòng */
    }
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(file)
  })
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode'))
    img.src = dataUrl
  })
}

/** Thu nhỏ ảnh (cạnh dài tối đa `max` px) và trả về data URL JPEG để tải lên. */
export const resizeImage = async (file, max = 800) => {
  let src
  try {
    src = await decodeImage(file)
  } catch {
    throw new Error('Không đọc được ảnh này. Hãy chọn ảnh JPG hoặc PNG (ảnh HEIC chưa hỗ trợ trên một số máy).')
  }
  const w = src.width
  const h = src.height
  const r = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * r))
  c.height = Math.max(1, Math.round(h * r))
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(src, 0, 0, c.width, c.height)
  src.close?.()
  return c.toDataURL('image/jpeg', 0.85)
}

// ---- Bản đồ ----
/** Lấy toạ độ từ chữ "10.77, 106.70" hoặc từ link Google Maps (@lat,lng / q=lat,lng / !3dlat!4dlng). Không có thì trả null. */
export const parseLatLng = (text) => {
  const t = decodeURIComponent(String(text || ''))
  const pats = [/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+)[, +]+(-?\d{1,3}\.\d+)/, /^\s*(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)\s*$/]
  for (const p of pats) {
    const m = t.match(p)
    if (m) {
      const lat = Number(m[1])
      const lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}

/** Đường chim bay giữa hai toạ độ (km). */
export const straightKm = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 100) / 100
}

const place = (p) => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.address || '')
/** Link mở Google Maps tại một điểm. */
export const mapsPlaceLink = (p) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place(p))
/** Link mở Google Maps chỉ đường từ điểm nhận đến điểm giao. */
export const mapsRouteLink = (a, b) => 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(place(a)) + '&destination=' + encodeURIComponent(place(b))

export const km = (n) => (n == null || n === '' ? '---' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Number(n)) + ' km')
