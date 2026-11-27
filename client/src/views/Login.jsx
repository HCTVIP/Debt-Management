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
    <form className="login" onSubmit={submit}>
      <h1>Quản lý tài chính</h1>
      <label>Tài khoản</label>
      <input autoComplete="username" autoCapitalize="none" required value={f.username} onChange={set('username')} />
      <label>Mật khẩu</label>
      <input type="password" autoComplete="current-password" required value={f.password} onChange={set('password')} />
      <button className="btn" style={{ width: '100%' }}>Đăng nhập</button>
    </form>
  )
}
