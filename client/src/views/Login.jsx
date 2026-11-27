import { useState } from 'react'
import { api, setToken } from '../api'
import { useApp } from '../ctx'
import { Input } from '../components/Fields.jsx'

const EyeIcon = ({ off }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
)

export default function Login({ onDone }) {
  const { run } = useApp()
  const [f, setF] = useState({ username: '', password: '' })
  const [show, setShow] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = run(async (e) => {
    e.preventDefault()
    const r = await api('/login', 'POST', f)
    setToken(r.token)
    onDone()
  })
  return (
    <div className="loginwrap">
      <div className="logincol">
        <div className="brand">
          <img className="logoimg" src="/logo-longtho.png" alt="Long Thọ" width="72" height="72" />
          <h1>Quản lý công nợ</h1>
          <p>Đơn hàng · Vận chuyển · Công nợ</p>
        </div>
        <form className="login" onSubmit={submit}>
          <label>Tài khoản</label>
          <Input autoComplete="username" autoCapitalize="none" required value={f.username} onChange={set('username')} />
          <label>Mật khẩu</label>
          <div className="pwfield">
            <Input endGap={44} type={show ? 'text' : 'password'} autoComplete="current-password" required value={f.password} onChange={set('password')} />
            <button type="button" className="eye" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show} onClick={() => setShow(!show)}>
              <EyeIcon off={show} />
            </button>
          </div>
          <button className="btn" style={{ width: '100%' }}>Đăng nhập</button>
        </form>
      </div>
    </div>
  )
}
