import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'

export default function ProductForm({ product, close }) {
  const { run, reload } = useApp()
  const p = product || {}
  const [f, setF] = useState({
    name: p.name || '',
    unit: p.unit || 'cái',
    stock: p.stock ?? 0,
    cost_price: p.cost_price ?? 0,
    sale_price: p.sale_price ?? 0,
    min_stock: p.min_stock ?? 0
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const num = (k, label) => (
    <div>
      <label>{label}</label>
      <input type="number" inputMode="decimal" min="0" step="any" value={f[k]} onChange={set(k)} />
    </div>
  )
  const submit = run(async (e) => {
    e.preventDefault()
    await api('/products' + (p.id ? '/' + p.id : ''), p.id ? 'PUT' : 'POST', f)
    close()
    reload()
  })
  const del = run(async () => {
    if (!confirm('Xoá hàng hóa này?')) return
    await api('/products/' + p.id, 'DELETE')
    close()
    reload()
  })
  return (
    <form onSubmit={submit}>
      <h2>{p.id ? 'Sửa' : 'Thêm'} hàng hóa</h2>
      <label>Tên *</label>
      <input required value={f.name} onChange={set('name')} />
      <div className="grid2">
        <div>
          <label>Đơn vị</label>
          <input value={f.unit} onChange={set('unit')} />
        </div>
        {num('stock', 'Tồn kho')}
        {num('cost_price', 'Giá vốn')}
        {num('sale_price', 'Giá bán')}
      </div>
      {num('min_stock', 'Cảnh báo khi tồn ≤')}
      <div className="acts">
        {p.id && <button type="button" className="btn dan" onClick={del}>Xoá</button>}
        <button className="btn">Lưu</button>
      </div>
    </form>
  )
}
