import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

export const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

/** Tải một hoặc nhiều đường dẫn API; tự tải lại khi `rev` (sau mỗi lần thêm/sửa/xoá) hoặc `paths` đổi. */
export function useData(paths) {
  const { rev } = useApp()
  const key = JSON.stringify(paths)
  const [state, setState] = useState({ loading: true, data: null, error: null })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.all(JSON.parse(key).map((p) => (typeof p === 'string' ? api(p) : api(p.path).catch(() => null))))
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }))
    return () => {
      live = false
    }
  }, [key, rev])
  return state
}
