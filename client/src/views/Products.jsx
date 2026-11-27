import { Fab, Status } from '../components/Bits.jsx'
import ProductForm from '../components/ProductForm.jsx'
import { useApp, useData } from '../ctx'
import { money, num } from '../utils'

export default function Products() {
  const { openSheet } = useApp()
  const st = useData(['/products', '/partners?type=supplier'])
  const [list, suppliers] = st.data || [[], []]
  const open = (p) => openSheet((close) => <ProductForm product={p} suppliers={suppliers} close={close} />)
  return (
    <>
      <Status state={st} />
      {st.data && (list.length ? (
        list.map((p) => (
          <div className="item link" key={p.id} onClick={() => open(p)}>
            <div className="row">
              <span className="t">{p.name}</span>
              <span className={'badge ' + (Number(p.stock) <= Number(p.min_stock) ? 'warn' : '')}>Tồn {num(p.stock)} {p.unit}</span>
            </div>
            <div className="row mut">
              <span>Vốn {money(p.cost_price)} · Bán {money(p.sale_price)}</span>
              <span>{suppliers.find((s) => s.id === p.supplier_id)?.name || ''}</span>
            </div>
          </div>
        ))
      ) : (
        <div className="empty">Chưa có hàng hóa</div>
      ))}
      <Fab onClick={() => open()} />
    </>
  )
}
