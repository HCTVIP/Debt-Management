import { useEffect, useRef, useState } from 'react'

/**
 * Hộp chẩn đoán kích thước màn hình, chỉ hiện khi mở địa chỉ có `?debug=1`.
 * Dùng để chụp màn hình gửi lại khi bố cục bị lệch trên điện thoại.
 */
export default function DebugBox() {
  const probe = useRef()
  const [info, setInfo] = useState({})
  useEffect(() => {
    const read = () => {
      const vv = window.visualViewport
      const px = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? -1)
      const p = probe.current
      setInfo({
        innerHeight: window.innerHeight,
        vvHeight: vv ? Math.round(vv.height) : '-',
        vvTop: vv ? Math.round(vv.offsetTop) : '-',
        htmlClient: document.documentElement.clientHeight,
        screen: window.screen.height,
        dvh: p ? Math.round(p.querySelector('.d').getBoundingClientRect().height) : '-',
        svh: p ? Math.round(p.querySelector('.s').getBoundingClientRect().height) : '-',
        lvh: p ? Math.round(p.querySelector('.l').getBoundingClientRect().height) : '-',
        safeBottom: p ? Math.round(p.querySelector('.b').getBoundingClientRect().height) : '-',
        root: px('#root'),
        app: px('.app'),
        appVar: getComputedStyle(document.documentElement).getPropertyValue('--app-h') || '(chưa đặt)',
        vvhVar: getComputedStyle(document.documentElement).getPropertyValue('--vvh') || '(không)'
      })
    }
    read()
    const t = setInterval(read, 700)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      <div ref={probe} aria-hidden="true" style={{ position: 'fixed', left: -9999, top: 0, visibility: 'hidden' }}>
        <div className="d" style={{ height: '100dvh', width: 1 }} />
        <div className="s" style={{ height: '100svh', width: 1 }} />
        <div className="l" style={{ height: '100lvh', width: 1 }} />
        <div className="b" style={{ height: 'env(safe-area-inset-bottom)', width: 1 }} />
      </div>
      <pre className="dbg">{Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
    </>
  )
}
