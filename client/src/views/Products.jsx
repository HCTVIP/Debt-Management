import { useState } from 'react'
import { Fab, Page, Status } from '../components/Bits.jsx'
import ProductForm from '../components/ProductForm.jsx'
import { useApp, useData } from '../ctx'
import { money, num } from '../utils'

export default function Products() {
  const { openSheet } = useApp()
  const [q, setQ] = useState('')
  const st = useData(['/products'])
  const k = q.trim().toLowerCase()
  const list = (st.data?.[0] || []).filter((p) => !k || p.name.toLowerCase().includes(k))
  const open = (p) => openSheet((close) => <ProductForm product={p} close={close} />)
  return (
    <Page filters={<input placeholder="Tìm tên hàng hóa" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <Status state={st} />
      {st.data && (list.length ? (
        <div className="pgrid">
          {list.map((p) => (
            <div className="pcard link" key={p.id} onClick={() => open(p)}>
              {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" /> : <div className="noimg">Chưa có ảnh</div>}
              <div className="pinfo">
                <div className="t">{p.name}</div>
                <span className={'badge nw ' + (Number(p.stock) <= Number(p.min_stock) ? 'warn' : '')}>Tồn {num(p.stock)} {p.unit}</span>
                <div className="mut">Bán {money(p.sale_price)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Không có hàng hóa</div>
      ))}
      <Fab onClick={() => open()} />
    </Page>
  )
}
