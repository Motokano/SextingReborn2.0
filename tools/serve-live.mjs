// serve-live.mjs — 零依赖 live-reload 静态服务器（给《潮碧物语》开发用）
// 用法：node tools/serve-live.mjs [端口] [根目录]
// 默认：端口 8000，根目录 = 项目根（本文件上一级）
// 功能：静态文件服务 + 文件变更时通过 SSE 推送页面自动刷新（改代码不用手动 F5）
//
// 禁用自动刷新（手动测试/游玩时避免被中途刷新打断）：
//   全局（所有页面不注入刷新脚本、不挂 watcher）：
//     LIVE_RELOAD=0 node tools/serve-live.mjs
//   单标签页（仅该页不自动刷新，其余标签照常 live-reload）：
//     打开 http://127.0.0.1:8000/?no_reload
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { watch as watchSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.argv[2] || process.env.PORT || 8000)
const ROOT = resolve(process.argv[3] || join(fileURLToPath(new URL('.', import.meta.url)), '..'))

/** 自动刷新总开关：LIVE_RELOAD=0 时全局禁用（不注入脚本、不挂 watcher、不广播）。 */
const RELOAD_ENABLED = process.env.LIVE_RELOAD !== '0' && process.env.LIVE_RELOAD !== 'false'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8', '.yml': 'text/plain; charset=utf-8',
}

// 注入到 HTML 的自动刷新脚本（SSE 收到 reload 事件即刷新页面）
const RELOAD_SCRIPT = `<script>
(function(){
  var es = new EventSource('/__live_reload');
  es.addEventListener('reload', function(){ location.reload(); });
  es.onerror = function(){ /* 服务器重启后 EventSource 会自动重连 */ };
})();
</script>`

// 只监听游戏运行时真正加载的目录/文件，避免 tools/docs/.dsh-kanban.json 等
// 高频变更目录造成无效刷新与 watcher 抖动（Windows 递归监听在大量文件
// 重命名/删除时易触发 EPERM，缩小范围 + error 自愈可显著降低崩溃概率）。
const WATCH_ROOTS = ['js', 'data', 'assets', 'image', ''] // '' = 根目录直子文件（index.html 等）
// 对这些扩展名的变更触发刷新
const RELOAD_EXTS = new Set(['.html', '.js', '.mjs', '.cjs', '.css', '.json', '.csv', '.yaml', '.yml'])
// 即使命中也忽略的文件（根目录下的元数据文件）
const IGNORE_FILES = new Set(['.dsh-kanban.json', 'skills-lock.json', 'package.json', 'package-lock.json', 'pnpm-lock.yaml'])

/** SSE 客户端连接集合 */
const sseClients = new Set()
let broadcastTimer = null
const lastBroadcastByFile = new Map() // 每文件冷却，避免同一文件连续写入时反复刷新
const FILE_COOLDOWN_MS = 800

function broadcastReload(file) {
  const now = Date.now()
  const last = lastBroadcastByFile.get(file) ?? 0
  if (now - last < FILE_COOLDOWN_MS) return
  lastBroadcastByFile.set(file, now)
  if (lastBroadcastByFile.size > 500) lastBroadcastByFile.clear() // 防无限增长
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    const payload = `event: reload\ndata: ${Date.now()}\n\n`
    for (const res of sseClients) {
      try { res.write(payload) } catch { sseClients.delete(res) }
    }
    console.log(`[live-reload] 文件变更已推送自动刷新（${file}）`)
  }, 120) // 120ms 防抖
}

function isRelevant(relPath) {
  const lower = String(relPath).toLowerCase()
  const ext = extname(lower)
  if (!RELOAD_EXTS.has(ext)) return false
  if (IGNORE_FILES.has(relPath.replace(/\\/g, '/'))) return false
  return true
}

function safeJoin(root, pathname) {
  const decoded = decodeURIComponent(pathname)
  const target = normalize(join(root, decoded))
  if (target !== root && !target.startsWith(root + sep)) return null // 防目录穿越
  return target
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  // SSE 长连接：文件变更广播
  if (url.pathname === '/__live_reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(`retry: 1000\n\n`)
    sseClients.add(res)
    const keepalive = setInterval(() => {
      try { res.write(`: keepalive\n\n`) } catch { clearInterval(keepalive) }
    }, 25000)
    req.on('close', () => { clearInterval(keepalive); sseClients.delete(res) })
    return
  }

  // 静态文件
  let target = safeJoin(ROOT, url.pathname)
  if (!target) { res.writeHead(403); res.end('Forbidden'); return }
  if (target === ROOT || (await stat(target).catch(() => null))?.isDirectory?.()) {
    target = join(target, 'index.html')
  }
  const rel = target.slice(ROOT.length + 1).split(sep)
  if (rel.some((seg) => seg === '.git' || seg === 'node_modules')) { res.writeHead(404); res.end('Not Found'); return }

  const info = await stat(target).catch(() => null)
  if (!info || !info.isFile()) { res.writeHead(404); res.end('Not Found'); return }

  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream'
  let body = await readFile(target)
  // 单标签页免刷：URL 带 no_reload 时不注入刷新脚本（该页永不被广播刷新）
  const noReloadReq = url.searchParams.has('no_reload')
  if (type.startsWith('text/html') && RELOAD_ENABLED && !noReloadReq && req.method !== 'HEAD') {
    body = Buffer.from(body.toString('utf8').replace('</body>', RELOAD_SCRIPT + '</body>'))
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  if (req.method !== 'HEAD') res.end(body)
  else res.end()
})

server.listen(PORT, () => {
  console.log(`[serve-live] 游戏已启动: http://127.0.0.1:${PORT}/  （根目录: ${ROOT}）`)
  console.log(`[serve-live] 改代码自动刷新已启用（监听: ${WATCH_ROOTS.join(', ')}）；按 Ctrl+C 停止`)
})

// 递归文件监听：按白名单目录逐个挂，带 error 自愈（Windows 下 EPERM/抖动时自动重挂）
// 子目录递归监听；根目录（''）只浅层监听直子文件（index.html 等），避免把
// tools/docs/reference/.git 等高频变更目录卷进来。
const watchers = new Set()
function mountWatch(dir, recursive) {
  const abs = dir === '' ? ROOT : join(ROOT, dir)
  const watcher = watchSync(abs, { recursive }, (event, filename) => {
    if (!filename) return
    const relPath = dir === '' ? String(filename) : join(dir, String(filename))
    if (!isRelevant(relPath)) return
    broadcastReload(relPath)
  })
  watcher.on('error', (err) => {
    console.log(`[serve-live] 监听 ${dir || '<root>'} 出错（${err?.code || err}），3 秒后自动重挂`)
    try { watcher.close() } catch { /* ignore */ }
    setTimeout(() => mountWatch(dir, recursive), 3000)
  })
  watchers.add(watcher)
}
for (const dir of WATCH_ROOTS) {
  if (!RELOAD_ENABLED) break // 全局禁用时不再挂 watcher
  const recursive = dir !== '' // 子目录递归，根目录浅层
  try { mountWatch(dir, recursive) }
  catch (err) {
    console.log(`[serve-live] 监听 ${dir || '<root>'} 挂载失败（${err?.code || err}），改为浅层监听`)
    try { mountWatch(dir, false) } catch { /* ignore */ }
  }
}
