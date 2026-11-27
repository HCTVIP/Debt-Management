import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './api'
import { Ctx } from './ctx'
import { loadPeriod } from './utils'
import Login from './views/Login.jsx'
import Home from './views/Home.jsx'
import Orders from './views/Orders.jsx'
import Debts from './views/Debts.jsx'
import Products from './views/Products.jsx'
import Sheet from './components/Sheet.jsx'
import { IconLogout } from './components/icons.jsx'
import Customers from './views/Customers.jsx'
import Shipments from './views/Shipments.jsx'

const TABS = [
  ['home', '📊', 'Tổng quan', Home],
  ['orders', '🧾', 'Đơn hàng', Orders],
  ['shipping', '🚚', 'Vận chuyển', Shipments],
  ['debts', '💰', 'Công nợ', Debts],
  ['products', '📦', 'Hàng hóa', Products],
  ['customers', '👥', 'Khách hàng', Customers]
]

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())
  const [tab, setTab] = useState('home')
  const [period, setPeriodState] = useState(loadPeriod)
  const [ord, setOrd] = useState({ partner: '', q: '' })
  const [rev, setRev] = useState(0)
  const [sheets, setSheets] = useState([])
  const [toastMsg, setToastMsg] = useState('')
  const sid = useRef(0)
  const toastTimer = useRef()

  const logout = useCallback(() => {
    setToken(null)
    setAuthed(false)
    setSheets([])
  }, [])
  useEffect(() => setUnauthorizedHandler(logout), [logout])

  const toast = useCallback((m) => {
    setToastMsg(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2500)
  }, [])

  const ctx = useMemo(
    () => ({
      rev,
      period,
      ord,
      setOrd: (p) => setOrd((o) => ({ ...o, ...p })),
      setPeriod: (p) => {
        setPeriodState(p)
        try {
          localStorage.setItem('period', JSON.stringify(p))
        } catch {
          /* bỏ qua: không lưu được bộ lọc */
        }
      },
      reload: () => setRev((r) => r + 1),
      toast,
      goTab: setTab,
      /** Mở một sheet; `render(close)` trả về nội dung. */
      openSheet: (render) => {
        const id = ++sid.current
        const close = () => setSheets((s) => s.filter((x) => x.id !== id))
        setSheets((s) => [...s, { id, node: render(close), close }])
        return close
      },
      /** Chạy hàm async, báo lỗi bằng toast. */
      run: (fn) => async (...a) => {
        try {
          await fn(...a)
        } catch (e) {
          toast(e.message)
        }
      }
    }),
    [rev, period, ord, toast]
  )

  if (!authed) {
    return (
      <Ctx.Provider value={ctx}>
        <Login onDone={() => setAuthed(true)} />
        {toastMsg && <div className="toast">{toastMsg}</div>}
      </Ctx.Provider>
    )
  }
  const [, , title, View] = TABS.find((t) => t[0] === tab)
  return (
    <Ctx.Provider value={ctx}>
      {/* Header và thanh tab cố định; chỉ vùng <main> cuộn */}
      <div className="app">
        <header className="top">
          <div className="brandmark" aria-hidden="true">₫</div>
          <h1>{title}</h1>
          <button className="iconbtn" onClick={logout} aria-label="Đăng xuất" title="Đăng xuất">
            <IconLogout />
          </button>
        </header>
        <main>
          <View key={tab} />
        </main>
        <nav className="tabs">
          {TABS.map(([k, icon, label]) => (
            <button
              key={k}
              className={k === tab ? 'on' : ''}
              aria-current={k === tab ? 'page' : undefined}
              onClick={() => {
                // Bấm lại tab đang mở: cuộn lên đầu danh sách (giống Facebook)
                if (k === tab) document.querySelector('.plist')?.scrollTo({ top: 0, behavior: 'smooth' })
                else setTab(k)
              }}
            >
              <span className="emo">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </div>
      {sheets.map((s) => (
        <Sheet key={s.id} onClose={s.close}>{s.node}</Sheet>
      ))}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </Ctx.Provider>
  )
}

export { api }
