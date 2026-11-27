import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { today } from '../utils'
import { Seg } from './Bits.jsx'
import DateInput from './DateInput.jsx'

const CATEGORIES = ['Xăng dầu', 'Lương', 'Sửa xe', 'Điện nước', 'Vận chuyển', 'Khác']

/** Thêm / sửa một khoản thu khác hoặc chi. */
export default function CashForm({ entry, close }) {
  const { run, reload } = useApp()
  const e0 = entry || {}
  const [f, setF] = useState({ kind: e0.kind || 'out', amount: e0.amount || '', entry_date: e0.date || today(), category: e0.category || '', note: e0.note || '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = run(async (e) => {
    e.preventDefault()
    await api('/cashflow' + (e0.id ? '/' + e0.id : ''), e0.id ? 'PUT' : 'POST', f)
    close()
    reload()
  })
  const del = run(async () => {
    if (!confirm('Xoá khoản này?')) return
    await api('/cashflow/' + e0.id, 'DELETE')
    close()
    reload()
  })
  return (
    <form onSubmit={submit}>
      <h2>{e0.id ? 'Sửa khoản' : 'Thêm khoản'} {f.kind === 'in' ? 'thu' : 'chi'}</h2>
      <Seg value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[['out', 'Chi'], ['in', 'Thu khác']]} />
      <label>Số tiền</label>
      <input type="number" inputMode="decimal" min="0" step="any" required value={f.amount} onChange={set('amount')} />
      <label>Ngày</label>
      <DateInput value={f.entry_date} onChange={(v) => setF({ ...f, entry_date: v })} />
      <label>Danh mục</label>
      <input list="cash-cats" value={f.category} onChange={set('category')} placeholder="Ví dụ: Xăng dầu" />
      <datalist id="cash-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <label>Ghi chú</label>
      <input value={f.note} onChange={set('note')} />
      <div className="acts">
        {e0.id && <button type="button" className="btn dan" onClick={del}>Xoá</button>}
        <button className="btn">Lưu</button>
      </div>
    </form>
  )
}
