/** Giới hạn theo IP trong bộ nhớ (đủ cho 1 instance). Bản ghi cũ được dọn định kỳ nên Map không phình ra. */
const sweeper = (hits, windowMs) => {
  const t = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k)
  }, Math.max(1000, windowMs))
  t.unref()
}

/** Đếm mọi yêu cầu: quá `max` trong `windowMs` thì trả 429. */
export function createLimiter({ max, windowMs, message = 'Quá nhiều yêu cầu, vui lòng thử lại sau' }) {
  const hits = new Map()
  sweeper(hits, windowMs)
  return (req, res, next) => {
    const now = Date.now()
    const h = hits.get(req.ip)
    if (!h || now - h.t > windowMs) hits.set(req.ip, { n: 1, t: now })
    else if (++h.n > max) return res.status(429).json({ error: message })
    next()
  }
}

/** Chỉ đếm lần thất bại (đăng nhập sai). */
export function createFailureTracker({ max, windowMs }) {
  const hits = new Map()
  sweeper(hits, windowMs)
  return {
    blocked: (key) => {
      const h = hits.get(key)
      return !!h && Date.now() - h.t <= windowMs && h.n >= max
    },
    fail: (key) => {
      const now = Date.now()
      const h = hits.get(key)
      if (!h || now - h.t > windowMs) hits.set(key, { n: 1, t: now })
      else h.n++
    },
    clear: (key) => hits.delete(key),
    size: () => hits.size
  }
}
