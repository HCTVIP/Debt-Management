import { useState } from 'react'
import { Fab, Status } from '../components/Bits.jsx'
import PartnerForm from '../components/PartnerForm.jsx'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { money } from '../utils'

export default function Customers() {
  const { openSheet } = useApp()
  const { openPartner } = useLinks()
  const [q, setQ] = useState('')
  const st = useData(['/partners?debt=1&type=customer'])
  const k = q.toLowerCase()
  const rows = (st.data?.[0] || []).filter((p) => !k || p.name.toLowerCase().includes(k) || (p.phone || '').includes(k))
  return (
    <>
      <input placeholder="Tìm tên / điện thoại" value={q} onChange={(e) => setQ(e.target.value)} />
      <Status state={st} />
      {st.data && (rows.length ? (
        rows.map((p) => (
          <div className="item link" key={p.id} onClick={() => openPartner(p.id)}>
            <div className="row">
              <span className="t">{p.name}</span>
              {p.debt > 0 && <b className="red nw">Nợ {money(p.debt)}</b>}
            </div>
            <div className="mut">{p.phone || '---'} · {p.address || '---'}</div>
          </div>
        ))
      ) : (
        <div className="empty">Chưa có khách hàng</div>
      ))}
      <Fab onClick={() => openSheet((close) => <PartnerForm close={close} />)} />
    </>
  )
}
