// Link rút gọn của Google Maps -> link đầy đủ có toạ độ. Mỗi bước chuyển hướng đều phải thuộc tên miền Google
// TRƯỚC khi gọi, để server không bị lợi dụng gọi URL tuỳ ý (SSRF).
const allowedHost = (h) => h === 'google.com' || h.endsWith('.google.com') || h === 'goo.gl' || h.endsWith('.goo.gl')

export async function resolveMapsLink(input, { fetchImpl = fetch, maxHops = 5, timeoutMs = 8000 } = {}) {
  let url
  try {
    url = new URL(String(input || ''))
  } catch {
    throw new Error('Link không hợp lệ')
  }
  for (let hop = 0; hop <= maxHops; hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || !allowedHost(url.hostname)) {
      throw new Error(hop === 0 ? 'Chỉ hỗ trợ link Google Maps' : 'Link không hợp lệ')
    }
    const r = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    r.body?.cancel?.().catch?.(() => {}) // không đọc nội dung: giải phóng kết nối
    const loc = r.headers.get('location')
    if (r.status >= 300 && r.status < 400 && loc) {
      url = new URL(loc, url)
      continue
    }
    return { url: url.href }
  }
  throw new Error('Link chuyển hướng quá nhiều lần')
}
