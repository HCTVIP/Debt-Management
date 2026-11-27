import { useApp } from '../ctx'
import { dt, money } from '../utils'
import OrderDetail from './OrderDetail.jsx'

export const Status = ({ state }) => (state.loading && !state.data ? <div className="state">Đang tải...</div> : state.error ? <div className="state red">{state.error.message}</div> : null)

export const Fab = ({ onClick }) => <button className="fab" onClick={onClick}>+</button>

export const Seg = ({ value, onChange, options }) => (
  <div className="seg">
    {options.map(([k, l]) => (
      <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
    ))}
  </div>
)

export const OrderRow = ({ o, onClick }) => (
  <div className="item link" onClick={onClick}>
    <div className="row"><span className="t">{o.partner_name}</span><b>{money(o.total)}</b></div>
    <div className="row mut">
      <span>{o.code} · {dt(o.order_date)}</span>
      {Number(o.debt) > 0 ? <span className="red">Nợ {money(o.debt)}</span> : <span className="grn">Đã thanh toán</span>}
    </div>
  </div>
)

/** Trả về hàm mở chi tiết đơn (sheet tự tải lại sau mỗi lần sửa). */
export const useOpenOrder = () => {
  const { openSheet } = useApp()
  return (id) => openSheet((close) => <OrderDetail id={id} close={close} />)
}
