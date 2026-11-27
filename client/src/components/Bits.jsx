import { useLinks } from '../links'
import { dt, money } from '../utils'

export const Status = ({ state }) => (state.loading && !state.data ? <div className="state">Đang tải...</div> : state.error ? <div className="state red">{state.error.message}</div> : null)

export const Fab = ({ onClick }) => <button className="fab" onClick={onClick}>+</button>

export const Seg = ({ value, onChange, options }) => (
  <div className="seg">
    {options.map(([k, l]) => (
      <button type="button" key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>
    ))}
  </div>
)

/** Chữ bấm được (không kích hoạt thẻ cha). */
export const Lnk = ({ onClick, children }) => (
  <span
    className="lnk"
    onClick={(e) => {
      e.stopPropagation()
      onClick()
    }}
  >
    {children}
  </span>
)

export const OrderRow = ({ o }) => {
  const { openOrder, openPartner } = useLinks()
  return (
    <div className="item link" onClick={() => openOrder(o.id)}>
      <div className="row">
        <span className="t"><Lnk onClick={() => openPartner(o.partner_id)}>{o.partner_name}</Lnk></span>
        <b>{money(o.total)}</b>
      </div>
      <div className="row mut">
        <span>{o.code} · {dt(o.order_date)}</span>
        {Number(o.debt) > 0 ? <span className="red">Nợ {money(o.debt)}</span> : <span className="grn">Đã thanh toán</span>}
      </div>
    </div>
  )
}

/** Khung trang: bộ lọc / tìm kiếm cố định ở đầu, chỉ danh sách bên dưới cuộn. */
export const Page = ({ filters, children }) => (
  <>
    <div className="pfilters">{filters}</div>
    <div className="plist">{children}</div>
  </>
)
