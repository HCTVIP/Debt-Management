import { useState } from 'react'
import { api, setToken } from '../api'
import { useApp } from '../ctx'

export default function Login({ onDone }) {
  const { run } = useApp()
  const [f, setF] = useState({ username: '', password: '' })
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
          <div className="logo" aria-hidden="true">₫</div>
          <h1>Quản lý công nợ</h1>
          <p>Đơn hàng · Vận chuyển · Công nợ</p>
        </div>
        <form className="login" onSubmit={submit}>
          <label>Tài khoản</label>
          <input autoComplete="username" autoCapitalize="none" required value={f.username} onChange={set('username')} />
          <label>Mật khẩu</label>
          <input type="password" autoComplete="current-password" required value={f.password} onChange={set('password')} />
          <button className="btn" style={{ width: '100%' }}>Đăng nhập</button>
        </form>
      </div>
    </div>
  )
}
