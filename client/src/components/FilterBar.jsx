import { useState } from 'react'
import { useApp } from '../ctx'
import { dt } from '../utils'
import DateInput from './DateInput.jsx'
import { Input } from './Fields.jsx'

/**
 * Nháp từ ngày - đến ngày: chỉ áp dụng cho cả ứng dụng (và gọi API) khi bấm Tìm.
 * `commit()` trả về false nếu khoảng ngày không hợp lệ.
 */
export function useDateDraft() {
  const { period, setPeriod, toast } = useApp()
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const commit = () => {
    if (from && to && from > to) {
      toast('Từ ngày phải trước đến ngày')
      return false
    }
    setPeriod({ from, to })
    return true
  }
  return { from, to, setFrom, setTo, commit }
}

/**
 * Khối lọc dùng chung. Mọi thay đổi chỉ là nháp; bấm Tìm (hoặc Enter) mới gọi `onSubmit`.
 * - `placeholder` + `q` + `setQ`: ô tìm kiếm, nút Tìm nằm cạnh ô tìm.
 * - `dates`: kết quả của `useDateDraft()` để hiện Từ ngày / Đến ngày.
 * - Không có ô tìm thì nút Tìm nằm cạnh hai ô ngày.
 */
export default function FilterBar({ placeholder, q, setQ, dates, onSubmit, children }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {placeholder && (
        <div className="fgroup">
          <div className="frow">
            <Input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn">Tìm</button>
          </div>
        </div>
      )}
      {children}
      {dates && (
        <div className={'drow' + (placeholder ? '' : ' withbtn')}>
          <DateInput value={dates.from} display={dates.from ? 'Từ ' + dt(dates.from) : ''} placeholder="Từ ngày" onChange={dates.setFrom} />
          <DateInput value={dates.to} display={dates.to ? 'Đến ' + dt(dates.to) : ''} placeholder="Đến ngày" onChange={dates.setTo} />
          {!placeholder && <button className="btn">Tìm</button>}
        </div>
      )}
    </form>
  )
}
