import { useRef, useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { resizeImage } from '../utils'

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
  // img.data: ảnh mới chọn (chờ lưu); img.remove: xoá ảnh hiện có
  const [img, setImg] = useState({ data: null, remove: false })
  const fileRef = useRef()
  const preview = img.data || (!img.remove && p.image_url) || null
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const num = (k, label) => (
    <div>
      <label>{label}</label>
      <input type="number" inputMode="decimal" min="0" step="any" value={f[k]} onChange={set(k)} />
    </div>
  )
  const pick = run(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImg({ data: await resizeImage(file), remove: false })
  })
  const submit = run(async (e) => {
    e.preventDefault()
    const saved = await api('/products' + (p.id ? '/' + p.id : ''), p.id ? 'PUT' : 'POST', f)
    const id = p.id || saved.id
    if (img.data) await api(`/products/${id}/image`, 'PUT', { data: img.data })
    else if (img.remove && p.image_url) await api(`/products/${id}/image`, 'DELETE')
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
      <div className="imgbox">
        {preview ? <img src={preview} alt={f.name} /> : <div className="noimg">Chưa có ảnh</div>}
        <div className="imgbtns">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          <button type="button" className="btn sec sm" onClick={() => fileRef.current.click()}>{preview ? 'Đổi ảnh' : 'Chọn ảnh'}</button>
          {preview && <button type="button" className="btn sec sm" onClick={() => setImg({ data: null, remove: true })}>Xoá ảnh</button>}
        </div>
      </div>
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
