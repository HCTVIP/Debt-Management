import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'

export default function PartnerForm({ partner, type, close }) {
  const { run, reload } = useApp()
  const p = partner || {}
  const t = p.type || type
  const [f, setF] = useState({ name: p.name || '', phone: p.phone || '', address: p.address || '', note: p.note || '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = run(async (e) => {
    e.preventDefault()
    await api('/partners' + (p.id ? '/' + p.id : ''), p.id ? 'PUT' : 'POST', { ...f, type: t })
    close()
    reload()
  })
  const del = run(async () => {
    if (!confirm('Xoá đối tác này?')) return
    await api('/partners/' + p.id, 'DELETE')
    close()
    reload()
  })
  return (
    <form onSubmit={submit}>
      <h2>{p.id ? 'Sửa' : 'Thêm'} {t === 'supplier' ? 'nguồn hàng' : 'khách hàng'}</h2>
      <label>Tên *</label>
      <input required value={f.name} onChange={set('name')} />
      <label>Điện thoại</label>
      <input type="tel" value={f.phone} onChange={set('phone')} />
      <label>Địa chỉ</label>
      <input value={f.address} onChange={set('address')} />
      <label>Ghi chú</label>
      <textarea value={f.note} onChange={set('note')} />
      <div className="acts">
        {p.id && <button type="button" className="btn dan" onClick={del}>Xoá</button>}
        <button className="btn">Lưu</button>
      </div>
    </form>
  )
}
