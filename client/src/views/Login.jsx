import { useState } from 'react'
import { api, setToken } from '../api'
import { useApp } from '../ctx'

export default function Login({ onDone }) {
  const { run } = useApp()
  const [pw, setPw] = useState('')
  const submit = run(async (e) => {
    e.preventDefault()
    const r = await api('/login', 'POST', { password: pw })
    setToken(r.token)
    onDone()
  })
  return (
    <form className="login" onSubmit={submit}>
      <h1>Quản lý tài chính</h1>
      <label>Mật khẩu</label>
      <input type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="btn" style={{ width: '100%' }}>Đăng nhập</button>
    </form>
  )
}
