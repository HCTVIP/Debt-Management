import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import OrderDetail from './components/OrderDetail.jsx'
import PartnerDetail from './components/PartnerDetail.jsx'
import ProductDetail from './components/ProductDetail.jsx'
import ShipmentForm from './components/ShipmentForm.jsx'
import { registerLinks } from './links'
import './style.css'

registerLinks({ OrderDetail, PartnerDetail, ProductDetail, ShipmentForm })
createRoot(document.getElementById('root')).render(<App />)
