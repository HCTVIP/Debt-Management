import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { Input, Textarea } from './Fields.jsx'

export default function PartnerForm({ partner, close }) {
  const { run, reload } = useApp()
  const p = partner || {}
  const [f, setF] = useState({ name: p.name || '', phone: p.phone || '', address: p.address || '', note: p.note || '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = run(async (e) => {
    e.preventDefault()
    await api('/partners' + (p.id ? '/' + p.id : ''), p.id ? 'PUT' : 'POST', { ...f, type: 'customer' })
    close()
    reload()
  })
  const del = run(async () => {
    if (!confirm('Xoá khách hàng này?')) return
    await api('/partners/' + p.id, 'DELETE')
    close()
    reload()
  })
  return (
    <form onSubmit={submit}>
      <h2>{p.id ? 'Sửa' : 'Thêm'} khách hàng</h2>
      <label>Tên *</label>
      <Input required value={f.name} onChange={set('name')} />
      <label>Điện thoại</label>
      <Input type="tel" value={f.phone} onChange={set('phone')} />
      <label>Địa chỉ</label>
      <Input value={f.address} onChange={set('address')} />
      <label>Ghi chú</label>
      <Textarea value={f.note} onChange={set('note')} />
      <div className="acts">
        {p.id && <button type="button" className="btn dan" onClick={del}>Xoá</button>}
        <button className="btn">Lưu</button>
      </div>
    </form>
  )
}
