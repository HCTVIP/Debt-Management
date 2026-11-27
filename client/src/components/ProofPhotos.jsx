import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useApp } from '../ctx'
import { resizeImage } from '../utils'

/**
 * Ảnh xác nhận giao hàng. Chuyến đã lưu thì tải lên ngay; chuyến mới thì giữ trong `pending` và tải lên sau khi lưu chuyến.
 */
export default function ProofPhotos({ shipmentId, pending, setPending }) {
  const { run } = useApp()
  const [saved, setSaved] = useState([])
  const [loading, setLoading] = useState(!!shipmentId)
  const fileRef = useRef()

  const load = () =>
    api(`/shipments/${shipmentId}/proofs`)
      .then(setSaved)
      .catch(() => setSaved([]))
      .finally(() => setLoading(false))
  useEffect(() => {
    if (shipmentId) load()
  }, [shipmentId])

  const pick = run(async (e) => {
    const input = e.target
    const files = [...(input.files || [])]
    try {
      for (const file of files) {
        const data = await resizeImage(file, 1280)
        if (shipmentId) {
          await api(`/shipments/${shipmentId}/proofs`, 'POST', { data })
          await load()
        } else setPending((p) => [...p, data])
      }
    } finally {
      input.value = ''
    }
  })
  const del = run(async (name) => {
    if (!confirm('Xoá ảnh này?')) return
    await api(`/shipments/${shipmentId}/proofs/${name}`, 'DELETE')
    await load()
  })

  const count = saved.length + pending.length
  return (
    <div className="proofs">
      <label>Ảnh xác nhận giao hàng {count > 0 && `(${count})`}</label>
      <div className="pgal">
        {saved.map((p) => (
          <div className="pthumb" key={p.name}>
            <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="Ảnh xác nhận giao hàng" loading="lazy" /></a>
            <button type="button" aria-label="Xoá ảnh" onClick={() => del(p.name)}>✕</button>
          </div>
        ))}
        {pending.map((d, i) => (
          <div className="pthumb" key={i}>
            <img src={d} alt="Ảnh chờ tải lên" />
            <button type="button" aria-label="Bỏ ảnh" onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="padd" onClick={() => fileRef.current.click()} disabled={loading}>
          <span>📷</span>
          Thêm ảnh
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />
      {!shipmentId && pending.length > 0 && <div className="mut hint">Ảnh sẽ được tải lên khi bấm Lưu.</div>}
    </div>
  )
}
