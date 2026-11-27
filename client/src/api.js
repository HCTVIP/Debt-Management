let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn)
export const getToken = () => localStorage.getItem('token')
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'))

export async function api(path, method = 'GET', body) {
  const token = getToken()
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401 && path !== '/login') onUnauthorized()
  if (!r.ok) throw new Error(j.error || 'Lỗi hệ thống')
  return j
}
