import { useState } from 'react'
import FilterBar from '../components/FilterBar.jsx'
import { Avatar, Fab, Page, Status, useChunk } from '../components/Bits.jsx'
import PartnerForm from '../components/PartnerForm.jsx'
import { useApp, useData } from '../ctx'
import { useLinks } from '../links'
import { money } from '../utils'

export default function Customers() {
  const { openSheet } = useApp()
  const { openPartner } = useLinks()
  const [text, setText] = useState('') // đang gõ
  const [q, setQ] = useState('') // đã áp dụng khi bấm Tìm
  const st = useData(['/partners?debt=1&type=customer'])
  const k = q.toLowerCase()
  const rows = (st.data?.[0] || []).filter((p) => !k || p.name.toLowerCase().includes(k) || (p.phone || '').includes(k))
  const [shown, mark] = useChunk(rows)
  return (
    <Page filters={<FilterBar placeholder="Tìm tên / điện thoại" q={text} setQ={setText} onSubmit={() => setQ(text)} />}>
      <Status state={st} />
      {st.data && (rows.length ? (
        <>
          {shown.map((p) => (
            <div className="item link orow" key={p.id} onClick={() => openPartner(p.id)}>
              <Avatar name={p.name} />
              <div className="obody">
                <div className="row">
                  <span className="t">{p.name}</span>
                  {p.debt > 0 && <b className="red nw">Nợ {money(p.debt)}</b>}
                </div>
                <div className="mut">{p.phone || '---'} · {p.address || '---'}</div>
              </div>
            </div>
          ))}
          {mark}
        </>
      ) : (
        <div className="empty">Chưa có khách hàng</div>
      ))}
      <Fab onClick={() => openSheet((close) => <PartnerForm close={close} />)} />
    </Page>
  )
}
