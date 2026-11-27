import { useState } from 'react'
import { Fab, Seg, Status } from '../components/Bits.jsx'
import PartnerDetail from '../components/PartnerDetail.jsx'
import PartnerForm from '../components/PartnerForm.jsx'
import { useApp, useData } from '../ctx'
import { money } from '../utils'

export default function Partners() {
  const { openSheet } = useApp()
  const [type, setType] = useState('supplier')
  const [q, setQ] = useState('')
  const st = useData([`/partners?debt=1&type=${type}`])
  const k = q.toLowerCase()
  const rows = (st.data?.[0] || []).filter((p) => !k || p.name.toLowerCase().includes(k) || (p.phone || '').includes(k))
  return (
    <>
      <Seg value={type} onChange={setType} options={[['supplier', 'Nguồn hàng'], ['customer', 'Khách hàng']]} />
      <input placeholder="Tìm tên / điện thoại" value={q} onChange={(e) => setQ(e.target.value)} />
      <Status state={st} />
      {st.data && (rows.length ? (
        rows.map((p) => (
          <div className="item link" key={p.id} onClick={() => openSheet((close) => <PartnerDetail partner={p} close={close} />)}>
            <div className="row">
              <span className="t">{p.name}</span>
              {p.debt > 0 && <b className={p.type === 'customer' ? 'grn' : 'red'}>Nợ {money(p.debt)}</b>}
            </div>
            <div className="mut">{p.phone || '---'} · {p.address || '---'}</div>
          </div>
        ))
      ) : (
        <div className="empty">Chưa có dữ liệu</div>
      ))}
      <Fab onClick={() => openSheet((close) => <PartnerForm type={type} close={close} />)} />
    </>
  )
}
