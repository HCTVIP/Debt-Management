import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAuth, credentialsMatch } from '../lib/auth.js'
import { dbError, describeError } from '../lib/errors.js'
import { createFailureTracker, createLimiter } from '../lib/limiter.js'
import { resolveMapsLink } from '../lib/mapsGuard.js'
import { addDay, inPeriod, isDate, period } from '../lib/period.js'

describe('auth', () => {
  it('token hợp lệ, hết hạn và bị sửa', () => {
    let t = 1_000_000
    const a = createAuth({ secret: 'x'.repeat(40), ttlMs: 1000, now: () => t })
    const tok = a.makeToken('admin')
    assert.equal(a.verify(tok), true)
    t += 1001
    assert.equal(a.verify(tok), false, 'hết hạn')
    t = 1_000_000
    const [p, sig] = tok.split('.')
    const forged = Buffer.from(JSON.stringify({ u: 'admin', exp: t + 1e12 })).toString('base64url')
    assert.equal(a.verify(`${forged}.${sig}`), false, 'đổi payload')
    assert.equal(a.verify(`${p}.${sig}.extra`), false)
    assert.equal(a.verify(''), false)
    assert.equal(a.verify(undefined), false)
    assert.equal(createAuth({ secret: 'y'.repeat(40) }).verify(tok), false, 'khác khoá ký')
  })

  it('middleware trả 401 khi thiếu token', () => {
    const a = createAuth({ secret: 's'.repeat(40) })
    const res = { code: 0, status(c) { this.code = c; return this }, json() { return this } }
    let nexted = false
    a.middleware({ headers: {} }, res, () => (nexted = true))
    assert.equal(res.code, 401)
    assert.equal(nexted, false)
    a.middleware({ headers: { authorization: 'Bearer ' + a.makeToken('u') } }, res, () => (nexted = true))
    assert.equal(nexted, true)
  })

  it('so khớp tài khoản không phân biệt hoa thường, mật khẩu phân biệt', () => {
    assert.equal(credentialsMatch(' Admin ', 'Mk123', 'admin', 'Mk123'), true)
    assert.equal(credentialsMatch('admin', 'mk123', 'admin', 'Mk123'), false)
    assert.equal(credentialsMatch('other', 'Mk123', 'admin', 'Mk123'), false)
  })
})

describe('limiter', () => {
  it('đếm thất bại, chặn khi đủ ngưỡng và xoá khi đăng nhập đúng', () => {
    const f = createFailureTracker({ max: 3, windowMs: 60_000 })
    for (let i = 0; i < 2; i++) f.fail('ip')
    assert.equal(f.blocked('ip'), false)
    f.fail('ip')
    assert.equal(f.blocked('ip'), true)
    assert.equal(f.blocked('khac'), false)
    f.clear('ip')
    assert.equal(f.blocked('ip'), false)
    assert.equal(f.size(), 0)
  })

  it('giới hạn số yêu cầu theo IP', () => {
    const lim = createLimiter({ max: 2, windowMs: 60_000 })
    const res = { code: 200, status(c) { this.code = c; return this }, json() { return this } }
    let passed = 0
    for (let i = 0; i < 4; i++) lim({ ip: '1.1.1.1' }, res, () => passed++)
    assert.equal(passed, 2)
    assert.equal(res.code, 429)
    lim({ ip: '2.2.2.2' }, res, () => passed++)
    assert.equal(passed, 3)
  })
})

describe('period', () => {
  it('kỳ theo ngày, tháng, năm; "đến ngày" tính cả ngày đó', () => {
    assert.deepEqual(period({ from: '2026-11-01', to: '2026-11-30' }), { from: '2026-11-01', to: '2026-12-01' })
    assert.deepEqual(period({ month: '2026-12' }), { from: '2026-12-01', to: '2027-01-01' })
    assert.deepEqual(period({ year: '2026' }), { from: '2026-01-01', to: '2027-01-01' })
    assert.deepEqual(period({ from: '2026-11-05' }), { from: '2026-11-05', to: '9999-12-31' })
    assert.equal(period({}), null)
  })

  it('từ chối giá trị sai', () => {
    assert.throws(() => period({ from: '2026-02-31' }), /Ngày không hợp lệ/)
    assert.throws(() => period({ from: 'abc' }), /Ngày không hợp lệ/)
    assert.throws(() => period({ from: '2026-12-01', to: '2026-11-01' }), /Từ ngày phải trước/)
    assert.throws(() => period({ month: '2026-13' }), /Tháng không hợp lệ/)
    assert.throws(() => period({ year: '26' }), /Năm không hợp lệ/)
    assert.equal(isDate('2024-02-29'), true)
    assert.equal(isDate('2025-02-29'), false)
  })

  it('addDay và inPeriod', () => {
    assert.equal(addDay('2026-12-31', 1), '2027-01-01')
    assert.equal(addDay('2026-03-01', -1), '2026-02-28')
    const calls = []
    const q = { gte: (c, v) => (calls.push(['gte', c, v]), q), lt: (c, v) => (calls.push(['lt', c, v]), q) }
    assert.equal(inPeriod(q, null), q)
    inPeriod(q, { from: 'a', to: 'b' }, 'paid_at')
    assert.deepEqual(calls, [['gte', 'paid_at', 'a'], ['lt', 'paid_at', 'b']])
  })
})

describe('errors', () => {
  it('thông báo từ hàm SQL (P0001) đến được người dùng', () => {
    const r = describeError(dbError({ code: 'P0001', message: 'Số tiền vượt công nợ còn lại' }))
    assert.deepEqual(r, { status: 400, body: { error: 'Số tiền vượt công nợ còn lại' }, log: false })
  })

  it('lỗi hệ thống bị che và được ghi log', () => {
    const r = describeError(dbError({ code: '42P01', message: 'relation "orders" does not exist' }))
    assert.equal(r.status, 500)
    assert.equal(r.log, true)
    assert.doesNotMatch(JSON.stringify(r.body), /relation|orders/)
  })

  it('không tìm thấy và thiếu hàm SQL', () => {
    assert.equal(describeError(dbError({ code: 'PGRST116', message: 'x' })).status, 404)
    const m = describeError(dbError({ code: 'PGRST202', message: 'Could not find the function' }))
    assert.match(m.body.error, /005_integrity\.sql/)
  })

  it('lỗi nhập liệu thường giữ nguyên thông báo', () => {
    assert.deepEqual(describeError(new Error('Nhập tên')), { status: 400, body: { error: 'Nhập tên' }, log: false })
  })
})

describe('resolveMapsLink', () => {
  const res = (status, location, body) => ({ status, headers: { get: (k) => (k.toLowerCase() === 'location' ? location : null) }, body })
  const run = (url, hops) => {
    const called = []
    const fetchImpl = async (u) => {
      called.push(String(u))
      return hops.shift()
    }
    return { called, p: resolveMapsLink(url, { fetchImpl }) }
  }

  it('theo chuyển hướng giữa các tên miền Google', async () => {
    const { called, p } = run('https://maps.app.goo.gl/abc', [
      res(302, 'https://consent.google.com/x'),
      res(302, 'https://www.google.com/maps/place/@16.4,107.5,17z'),
      res(200)
    ])
    assert.deepEqual(await p, { url: 'https://www.google.com/maps/place/@16.4,107.5,17z' })
    assert.equal(called.length, 3)
  })

  it('không gọi tới host ngoài Google dù được chuyển hướng tới đó', async () => {
    const { called, p } = run('https://www.google.com/url?q=x', [res(302, 'http://169.254.169.254/latest/meta-data')])
    await assert.rejects(p, /Link không hợp lệ/)
    assert.deepEqual(called, ['https://www.google.com/url?q=x'])
  })

  it('từ chối link đầu vào không phải Google, http, hoặc giả tên miền', async () => {
    for (const bad of ['https://evil.com/x', 'http://www.google.com/maps', 'https://google.com.evil.com/', 'https://notgoogle.com/', 'https://user:pw@www.google.com/', 'khong-phai-url']) {
      const { called, p } = run(bad, [res(200)])
      await assert.rejects(p, /Chỉ hỗ trợ link Google Maps|Link không hợp lệ/, bad)
      assert.equal(called.length, 0, bad)
    }
  })

  it('dừng khi chuyển hướng quá nhiều lần', async () => {
    const hops = Array.from({ length: 20 }, () => res(302, 'https://www.google.com/loop'))
    await assert.rejects(run('https://www.google.com/loop', hops).p, /quá nhiều lần/)
  })
})
