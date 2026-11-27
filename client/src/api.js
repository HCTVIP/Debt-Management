import { useSyncExternalStore } from 'react'

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn)
export const getToken = () => localStorage.getItem('token')
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'))

// ---- Trạng thái loading toàn cục: đếm số API đang chạy (get = đọc, mut = thêm/sửa/xoá/đăng nhập) ----
let snapshot = { get: 0, mut: 0 }
const listeners = new Set()
const track = (kind, delta) => {
  snapshot = { ...snapshot, [kind]: snapshot[kind] + delta }
  listeners.forEach((l) => l())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
/** Hook: { get, mut } số API đang chạy. */
export const useLoading = () => useSyncExternalStore(subscribe, () => snapshot)

const TIMEOUT_MS = 30000

export async function api(path, method = 'GET', body) {
  const kind = method === 'GET' ? 'get' : 'mut'
  const token = getToken()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  track(kind, 1)
  try {
    let r
    try {
      r = await fetch('/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      })
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Hết thời gian chờ, vui lòng thử lại' : 'Không kết nối được máy chủ')
    }
    const j = await r.json().catch(() => ({}))
    if (r.status === 401 && path !== '/login') onUnauthorized()
    if (!r.ok) throw new Error(j.error || 'Lỗi hệ thống')
    return j
  } finally {
    clearTimeout(timer)
    track(kind, -1)
  }
}
