export const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫'
export const num = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(n) || 0)
export const dt = (d) => (d ? d.split('-').reverse().join('/') : '---')
export const today = () => new Date().toISOString().slice(0, 10)

export const defaultPeriod = () => ({ mode: 'month', month: new Date().toISOString().slice(0, 7), year: String(new Date().getFullYear()), from: '', to: '' })

export const loadPeriod = () => {
  try {
    const p = { ...defaultPeriod(), ...JSON.parse(localStorage.getItem('period')) }
    // Đã bỏ chế độ "Tất cả": người dùng cũ còn lưu 'all' thì chuyển về theo tháng
    return p.mode === 'all' ? { ...p, mode: 'month' } : p

  } catch {
    return defaultPeriod()
  }
}

export const periodQS = (p) => {
  if (p.mode === 'month') return 'month=' + p.month
  if (p.mode === 'year') return 'year=' + p.year
  if (p.mode === 'range') return [p.from && 'from=' + p.from, p.to && 'to=' + p.to].filter(Boolean).join('&')
  return ''
}

export const periodLabel = (p) => {
  if (p.mode === 'month') return 'Tháng ' + p.month.split('-').reverse().join('/')
  if (p.mode === 'year') return 'Năm ' + p.year
  if (p.mode === 'range') return `${p.from ? dt(p.from) : '...'} - ${p.to ? dt(p.to) : '...'}`
  return 'Tất cả'
}

export const qs = (...parts) => parts.filter(Boolean).join('&')

export const SHIP_STATUS = { pending: 'Chờ giao', shipping: 'Đang giao', delivered: 'Đã giao' }

/** Thu nhỏ ảnh (cạnh dài tối đa `max` px) và trả về data URL JPEG để tải lên. */
export const resizeImage = (file, max = 800) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r)
      c.height = Math.round(img.height * r)
      const g = c.getContext('2d')
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Không đọc được ảnh'))
    }
    img.src = url
  })
