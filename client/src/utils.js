export const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫'
export const num = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(n) || 0)
export const dt = (d) => (d ? d.split('-').reverse().join('/') : '---')
export const today = () => new Date().toISOString().slice(0, 10)

export const defaultPeriod = () => ({ mode: 'month', month: new Date().toISOString().slice(0, 7), year: String(new Date().getFullYear()), from: '', to: '' })

export const loadPeriod = () => {
  try {
    return { ...defaultPeriod(), ...JSON.parse(localStorage.getItem('period')) }
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
