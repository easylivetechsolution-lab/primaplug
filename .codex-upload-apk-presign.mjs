import fs from 'node:fs'
import https from 'node:https'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('C:/primeplug/.env', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => !line.trim().startsWith('#'))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const file = 'C:/prima_app/build/app/outputs/flutter-apk/app-release.apk'
const contentType = 'application/vnd.android.package-archive'

const { data, error } = await supabase.functions.invoke('r2-presign', {
  body: { fileName: 'PrimaPlug.apk', contentType, folder: 'app' },
})

if (error || !data?.uploadUrl) {
  throw new Error(error?.message || data?.error || 'Failed to get upload URL')
}

const size = fs.statSync(file).size

await new Promise((resolve, reject) => {
  const u = new URL(data.uploadUrl)
  const req = https.request({
    method: 'PUT',
    hostname: u.hostname,
    path: u.pathname + u.search,
    headers: {
      'Content-Type': contentType,
      'Content-Length': size,
    },
  }, res => {
    let text = ''
    res.on('data', d => { text += d })
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve()
      else reject(new Error(`Upload failed ${res.statusCode}: ${text}`))
    })
  })
  req.on('error', reject)
  fs.createReadStream(file).pipe(req)
})

console.log(data.publicUrl)
