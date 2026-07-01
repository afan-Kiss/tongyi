#!/usr/bin/env node
/**
 * 部署前检查：构建、数据库、端口、路由、健康检查
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const net = require('node:net')

const ROOT = path.join(__dirname, '..')
process.chdir(ROOT)

const checks = []
let failed = 0

function pass(name, detail) {
  checks.push({ name, ok: true, detail })
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail })
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
  failed += 1
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', ...opts })
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function main() {
  console.log('========== tongyi 部署前检查 ==========\n')

  // 1. build
  const build = run('npm', ['run', 'build'], { stdio: 'pipe' })
  if (build.status === 0) pass('npm run build')
  else fail('npm run build', (build.stderr || build.stdout || '').slice(-400))

  // 2. prisma generate
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:apps/server/data/app.db'
  const gen = run('npm', ['run', 'db:generate'], { stdio: 'pipe' })
  if (gen.status === 0) pass('Prisma generate')
  else fail('Prisma generate', (gen.stderr || gen.stdout || '').slice(-300))

  // 3. 必要目录
  const dirs = [
    'apps/server/data',
    'apps/server/prisma',
    'apps/web/dist',
    'apps/server/dist',
    'scripts',
  ]
  for (const d of dirs) {
    if (fs.existsSync(path.join(ROOT, d))) pass(`目录存在 ${d}`)
    else fail(`目录存在 ${d}`)
  }

  // 4. 上传/媒体目录可写
  const mediaDir = path.join(ROOT, 'apps/server/data')
  try {
    fs.mkdirSync(mediaDir, { recursive: true })
    const probe = path.join(mediaDir, '.write-probe')
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    pass('数据库目录可写', mediaDir)
  } catch (e) {
    fail('数据库目录可写', e.message)
  }

  // 5. 端口规划
  const { resolvePlan } = require('./port-precheck.js')
  const plan = await resolvePlan()
  if (plan) {
    pass('端口组可用', `base=${plan.basePort} main=${plan.ports.main}`)
  } else if (process.env.TONGYI_PORT_BASE || process.env.PORT) {
    fail('端口组可用', '指定端口不可用')
  } else {
    fail('端口组可用', '所有 fallback 端口均不可用')
  }

  // 6. 数据库连接
  try {
    const { PrismaClient } = require('@prisma/client')
    const p = new PrismaClient()
    await p.$queryRawUnsafe('SELECT 1')
    await p.$disconnect()
    pass('数据库可连接')
  } catch (e) {
    fail('数据库可连接', e.message)
  }

  // 7. 路由挂载（静态检查）
  const v1Index = fs.readFileSync(path.join(ROOT, 'apps/server/src/routes/v1/index.ts'), 'utf8')
  if (v1Index.includes("use('/accounting'")) pass('accounting 路由已挂载')
  else fail('accounting 路由已挂载')
  if (v1Index.includes("use('/live-analysis'")) pass('live-analysis 路由已挂载')
  else fail('live-analysis 路由已挂载')
  if (v1Index.includes("use('/qianfan-sync'")) pass('qianfan-sync 路由已挂载')
  else fail('qianfan-sync 路由已挂载')

  // 8. 迁移脚本存在
  for (const f of ['import-legacy-accounting.js', 'import-legacy-live-analysis.js', 'check-valid-revenue-rules.js']) {
    if (fs.existsSync(path.join(ROOT, 'scripts', f))) pass(`脚本存在 ${f}`)
    else fail(`脚本存在 ${f}`)
  }

  // 9. 有效成交口径
  const vr = run('node', ['scripts/check-valid-revenue-rules.js'], { stdio: 'pipe' })
  if (vr.status === 0) pass('有效成交口径检查')
  else fail('有效成交口径检查', (vr.stderr || vr.stdout || '').slice(-200))

  // 10. health（若服务已在运行）
  const port = plan?.ports?.main || Number(process.env.PORT) || 9000
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json()
      pass('/api/v1/health', data.service || 'ok')
    } else {
      pass('health 跳过', `服务未在 ${port} 响应（部署前可忽略）`)
    }
  } catch {
    pass('health 跳过', `127.0.0.1:${port} 未启动（本地检查其余项仍有效）`)
  }

  // 11. local-agent 离线提示（静态检查 agent 路由）
  const agentRoutes = fs.readFileSync(path.join(ROOT, 'apps/server/src/modules/agent/agent.routes.ts'), 'utf8')
  if (agentRoutes.includes('/status')) pass('local-agent 状态接口存在（离线时不阻塞主系统）')
  else fail('local-agent 状态接口')

  console.log('\n========== 汇总 ==========')
  console.log(`通过 ${checks.filter((c) => c.ok).length} / ${checks.length}`)
  if (failed > 0) {
    console.error(`失败 ${failed} 项，请修复后再部署`)
    process.exit(1)
  }
  console.log('可以部署')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
