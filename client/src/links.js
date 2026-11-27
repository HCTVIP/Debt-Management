import { createElement } from 'react'
import { useApp } from './ctx'

// Các sheet liên kết chéo giữa các tab (đơn hàng ↔ khách hàng ↔ hàng hóa ↔ vận chuyển).
// Đăng ký component ở main.jsx để tránh import vòng giữa các component.
const reg = {}
export const registerLinks = (components) => Object.assign(reg, components)

export function useLinks() {
  const { openSheet } = useApp()
  return {
    openOrder: (id) => openSheet((close) => createElement(reg.OrderDetail, { id, close })),
    openPartner: (id) => openSheet((close) => createElement(reg.PartnerDetail, { id, close })),
    openProduct: (id) => openSheet((close) => createElement(reg.ProductDetail, { id, close })),
    openShipment: (shipment, order) => openSheet((close) => createElement(reg.ShipmentForm, { shipment, order, close }))
  }
}
