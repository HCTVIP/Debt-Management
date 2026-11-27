// Build production: sao chép public -> dist, thêm hash vào tên file JS/CSS để cache an toàn.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const src = 'public'
const out = 'dist'
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8')
for (const f of fs.readdirSync(src)) {
  if (f === 'index.html') continue
  const buf = fs.readFileSync(path.join(src, f))
  if (/\.(js|css)$/.test(f)) {
    const h = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8)
    const name = f.replace(/\.(\w+)$/, `.${h}.$1`)
    fs.writeFileSync(path.join(out, name), buf)
    html = html.replaceAll(f, name)
  } else fs.copyFileSync(path.join(src, f), path.join(out, f))
}
fs.writeFileSync(path.join(out, 'index.html'), html)
console.log('Build xong ->', out)
