import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 3001)
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' }

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname)
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const filePath = path.resolve(root, `.${requestedPath}`)

  if (!filePath.startsWith(root) || !statSafe(filePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.end('Not found')
    return
  }

  response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  createReadStream(filePath).pipe(response)
}).listen(port, '127.0.0.1', () => console.log(`BeanPulse is running at http://127.0.0.1:${port}`))

function statSafe(filePath) {
  try { return statSync(filePath).isFile() } catch { return false }
}
