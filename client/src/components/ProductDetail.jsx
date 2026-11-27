import { useData } from '../ctx'
import { Status } from './Bits.jsx'
import ProductForm from './ProductForm.jsx'

/** Mở hàng hóa theo id (liên kết từ dòng hàng trong đơn). */
export default function ProductDetail({ id, close }) {
  const st = useData([`/products/${id}`])
  if (!st.data) return <Status state={st} />
  return <ProductForm product={st.data[0]} close={close} />
}
