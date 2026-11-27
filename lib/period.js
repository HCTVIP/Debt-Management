// Lọc theo kỳ: from/to (to tính cả ngày đó), month=YYYY-MM hoặc year=YYYY. Trả { from, to } với `to` là ngày KHÔNG tính; bỏ trống = null.
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
export const isDate = (d) => DATE.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d
export const addDay = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10)

export const period = (query) => {
  const { month, year, from, to } = query
  if (from || to) {
    if ((from && !isDate(from)) || (to && !isDate(to))) throw new Error('Ngày không hợp lệ')
    if (from && to && from > to) throw new Error('Từ ngày phải trước đến ngày')
    return { from: from || '0001-01-01', to: to ? addDay(to, 1) : '9999-12-31' }
  }
  if (month) {
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Tháng không hợp lệ')
    const [y, m] = month.split('-').map(Number)
    const ny = m === 12 ? y + 1 : y
    const nm = m === 12 ? 1 : m + 1
    return { from: `${month}-01`, to: `${ny}-${String(nm).padStart(2, '0')}-01` }
  }
  if (year) {
    if (!/^[0-9]{4}$/.test(year)) throw new Error('Năm không hợp lệ')
    return { from: `${year}-01-01`, to: `${Number(year) + 1}-01-01` }
  }
  return null
}
export const inPeriod = (q, p, col = 'order_date') => (p ? q.gte(col, p.from).lt(col, p.to) : q)
