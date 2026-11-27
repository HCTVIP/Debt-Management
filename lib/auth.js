import crypto from 'node:crypto'

export const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
const sha256 = (x) => crypto.createHash('sha256').update(x).digest('hex')

/** Token = payload.hmac, có hạn. Chỉ chứa tên đăng nhập và hạn dùng. */
export function createAuth({ secret, ttlMs = 7 * 864e5, now = Date.now }) {
  const sign = (s) => crypto.createHmac('sha256', secret).update(s).digest('base64url')
  const makeToken = (u) => {
    const p = Buffer.from(JSON.stringify({ u, exp: now() + ttlMs })).toString('base64url')
    return `${p}.${sign(p)}`
  }
  const verify = (t = '') => {
    const [p, sig, extra] = String(t).split('.')
    if (!p || !sig || extra !== undefined || !safeEq(sig, sign(p))) return false
    try {
      const j = JSON.parse(Buffer.from(p, 'base64url').toString())
      return typeof j.u === 'string' && j.exp > now()
    } catch {
      return false
    }
  }
  const middleware = (req, res, next) =>
    verify((req.headers.authorization || '').replace(/^Bearer /, '')) ? next() : res.status(401).json({ error: 'Chưa đăng nhập' })
  return { makeToken, verify, middleware }
}

/** So sánh tài khoản / mật khẩu bằng hash để không lộ độ dài và không lộ cái nào đúng. */
export const credentialsMatch = (user, pw, expectedUser, expectedPw) => {
  const okUser = safeEq(sha256(String(user).trim().toLowerCase()), sha256(String(expectedUser).toLowerCase()))
  const okPw = safeEq(sha256(String(pw)), sha256(String(expectedPw)))
  return okUser && okPw
}
