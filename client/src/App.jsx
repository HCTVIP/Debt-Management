import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, apiDownload, getToken, setToken, setUnauthorizedHandler } from './api'
import { Ctx } from './ctx'
import { loadPeriod, periodQS } from './utils'
import Login from './views/Login.jsx'
import Home from './views/Home.jsx'
import Orders from './views/Orders.jsx'
import Debts from './views/Debts.jsx'
import Products from './views/Products.jsx'
import LoadingLayer from './components/LoadingLayer.jsx'
import Sheet from './components/Sheet.jsx'
import { IconDownload, IconLogout } from './components/icons.jsx'
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
  // Xuất Excel công nợ theo bộ lọc đang áp dụng ở Tổng quan (mỗi khách hàng một sheet)
  const exportExcel = async () => {
    try {
      await apiDownload('/export/excel?' + periodQS(period))
      toast('Đã xuất file Excel')
    } catch (e) {
      toast(e.message)
    }
  }
  // Chỉ nút đăng xuất cần xác nhận; hết phiên (401) thì đăng xuất ngay
  const askLogout = () => {
    if (confirm('Bạn có chắc muốn đăng xuất?')) logout()
  }

  // Bàn phím ảo: theo dõi vùng nhìn thấy thật (visualViewport) để biểu mẫu / sheet không bị bàn phím che
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement.style
    const isField = (t) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
    const center = (t) => t.scrollIntoView({ block: 'center' })
    const sync = () => {
      root.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px')
      root.setProperty('--vvt', (vv ? vv.offsetTop : 0) + 'px')
      // Bàn phím vừa mở / đóng khi đang nhập: đưa ô đang nhập vào giữa vùng nhìn thấy
      if (isField(document.activeElement)) setTimeout(() => center(document.activeElement), 50)
    }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    // Khi bấm vào ô nhập, cuộn ô đó vào giữa vùng nhìn thấy (sau khi bàn phím mở)
    const onFocus = (e) => {
      if (isField(e.target)) setTimeout(() => center(e.target), 350)
    }
    document.addEventListener('focusin', onFocus)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      document.removeEventListener('focusin', onFocus)
    }
  }, [])

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
        <LoadingLayer />
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
          {tab === 'home' && (
            <button className="hexport" onClick={exportExcel} aria-label="Xuất Excel theo bộ lọc" title="Xuất Excel theo bộ lọc">
              <IconDownload />
              Xuất Excel
            </button>
          )}
          <button className="iconbtn" onClick={askLogout} aria-label="Đăng xuất" title="Đăng xuất">
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
      <LoadingLayer />
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </Ctx.Provider>
  )
}

export { api }
