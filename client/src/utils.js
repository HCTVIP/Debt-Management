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

export const loadPeriod = () => {
  try {
    const p = JSON.parse(localStorage.getItem('period'))
    if (!p) return defaultPeriod()
    if ('from' in p && !('mode' in p)) return { from: p.from || '', to: p.to || '' }
    // Dữ liệu cũ (chế độ tháng / năm / khoảng ngày) -> quy về từ ngày - đến ngày
    if (p.mode === 'month' && p.month) {
      const [y, m] = p.month.split('-').map(Number)
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    }
    if (p.mode === 'year' && p.year) return { from: p.year + '-01-01', to: p.year + '-12-31' }
    if (p.mode === 'range') return { from: p.from || '', to: p.to || '' }
    return defaultPeriod()
  } catch {
    return defaultPeriod()
  }
}

export const periodQS = (p) => [p.from && 'from=' + p.from, p.to && 'to=' + p.to].filter(Boolean).join('&')

export const periodLabel = (p) => (p.from || p.to ? `${p.from ? dt(p.from) : '...'} - ${p.to ? dt(p.to) : '...'}` : 'Tất cả thời gian')

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
