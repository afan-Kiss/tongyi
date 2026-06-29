/**

 * 后端进程管理 — 自动拉起 Excel 桥接、祥钰 Web + Bridge 子进程（常驻）

 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'

import path from 'node:path'

import fs from 'node:fs'

import {
  SERVER_ROOT,
  getExcelBridgePort,
  getOutboundConfigPath,
  getXiangyuBridgeConfig,
  type XiangyuBridgeConfig,
  getXiangyuBridgePort,
  getXiangyuPort,
  getXiangyuRoot,
  getPrintAgentPort,
  isXiangyuEnabled,
} from '../config/env'

import {
  ensurePrintAgentPortFree,
  findListeningPids,
  pingPrintAgentHealthSync,
} from '../lib/kill-port'



let shuttingDown = false

let bridgeProc: ChildProcess | null = null

let printAgentProc: ChildProcess | null = null

let bridgeRestartTimer: ReturnType<typeof setTimeout> | null = null

let printAgentRestartTimer: ReturnType<typeof setTimeout> | null = null

let bridgeManualStop = false

let printAgentManualStop = false

let bridgeRestartAttempts = 0

let printAgentRestartAttempts = 0



let xiangyuWebProc: ChildProcess | null = null

let xiangyuBridgeProc: ChildProcess | null = null

let xiangyuWebRestartTimer: ReturnType<typeof setTimeout> | null = null

let xiangyuBridgeRestartTimer: ReturnType<typeof setTimeout> | null = null

let xiangyuWebManualStop = false

let xiangyuBridgeManualStop = false

let xiangyuWebRestartAttempts = 0

let xiangyuBridgeRestartAttempts = 0



const RESTART_BASE_MS = 5000

const RESTART_MAX_MS = 60_000

/** 子进程稳定运行超过此时间后，重置崩溃退避计数 */
const STABLE_RUN_MS = 60_000



let bridgeStableTimer: ReturnType<typeof setTimeout> | null = null

let printAgentStableTimer: ReturnType<typeof setTimeout> | null = null

let xiangyuWebStableTimer: ReturnType<typeof setTimeout> | null = null

let xiangyuBridgeStableTimer: ReturnType<typeof setTimeout> | null = null



/** 全局 shutdown 标记；stop 函数与 exit 重启逻辑均会读取 */
export function markProcessManagerShuttingDown(): void {
  shuttingDown = true
  bridgeManualStop = true
  printAgentManualStop = true
  xiangyuWebManualStop = true
  xiangyuBridgeManualStop = true
  bridgeRestartTimer = clearRestartTimer(bridgeRestartTimer)
  printAgentRestartTimer = clearRestartTimer(printAgentRestartTimer)
  xiangyuWebRestartTimer = clearRestartTimer(xiangyuWebRestartTimer)
  xiangyuBridgeRestartTimer = clearRestartTimer(xiangyuBridgeRestartTimer)
  bridgeStableTimer = clearRestartTimer(bridgeStableTimer)
  printAgentStableTimer = clearRestartTimer(printAgentStableTimer)
  xiangyuWebStableTimer = clearRestartTimer(xiangyuWebStableTimer)
  xiangyuBridgeStableTimer = clearRestartTimer(xiangyuBridgeStableTimer)
}

export function isProcessManagerShuttingDown(): boolean {
  return shuttingDown
}



function clearRestartTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) clearTimeout(timer)
  return null
}

function armStableReset(
  onReset: () => void,
): ReturnType<typeof setTimeout> {
  const t = setTimeout(onReset, STABLE_RUN_MS)
  t.unref?.()
  return t
}



function restartDelayMs(attempts: number): number {
  const exp = RESTART_BASE_MS * Math.pow(2, Math.min(attempts, 4))
  return Math.min(exp, RESTART_MAX_MS)
}



function scheduleProcessRestart(
  label: string,
  attempts: number,
  timerRef: { current: ReturnType<typeof setTimeout> | null },
  manualStop: () => boolean,
  startFn: () => void,
): void {
  if (shuttingDown || manualStop()) return
  if (timerRef.current) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const delay = restartDelayMs(attempts)
  console.warn(`[process-manager] ${label} 将在 ${delay / 1000}s 后重启 (attempt=${attempts + 1})...`)
  timerRef.current = setTimeout(() => {
    timerRef.current = null
    if (shuttingDown || manualStop()) return
    startFn()
  }, delay)
  timerRef.current.unref?.()
}



function bridgeDir(): string {

  return path.resolve(SERVER_ROOT, '../../agents/excel-bridge')

}

function printAgentDir(): string {

  return path.resolve(SERVER_ROOT, '../../agents/print-agent')

}

function printAgentPython(): string {

  const venvPy = path.join(printAgentDir(), '.venv', 'Scripts', 'python.exe')

  if (fs.existsSync(venvPy)) return venvPy

  return 'python'

}

function ensurePrintAgentVenv(): void {
  if (process.platform !== 'win32') return
  const dir = printAgentDir()
  const venvPy = path.join(dir, '.venv', 'Scripts', 'python.exe')
  const req = path.join(dir, 'requirements.txt')
  if (fs.existsSync(venvPy) || !fs.existsSync(req)) return
  console.log('[process-manager] print-agent 虚拟环境不存在，正在创建并安装依赖…')
  try {
    execSync('python -m venv .venv', { cwd: dir, stdio: 'inherit' })
    execSync('.venv\\Scripts\\pip.exe install -r requirements.txt -q', {
      cwd: dir,
      stdio: 'inherit',
      shell: process.platform === 'win32' ? 'cmd.exe' : undefined,
    })
  } catch (err) {
    console.warn('[process-manager] print-agent 依赖安装失败:', err)
  }
}



function bridgePython(): string {

  const dir = bridgeDir()
  const candidates = [
    path.join(dir, '.venv', 'Scripts', 'python.exe'),
    path.join(dir, 'venv', 'Scripts', 'python.exe'),
  ]
  for (const venvPy of candidates) {
    if (fs.existsSync(venvPy)) return venvPy
  }
  return 'python'

}

function ensureExcelBridgeVenv(): void {
  if (process.platform !== 'win32') return
  const dir = bridgeDir()
  const req = path.join(dir, 'requirements.txt')
  if (!fs.existsSync(req)) return
  const venvCandidates = [
    path.join(dir, '.venv', 'Scripts', 'python.exe'),
    path.join(dir, 'venv', 'Scripts', 'python.exe'),
  ]
  if (venvCandidates.some((p) => fs.existsSync(p))) return
  console.log('[process-manager] excel-bridge 虚拟环境不存在，正在创建并安装依赖…')
  try {
    execSync('python -m venv .venv', { cwd: dir, stdio: 'inherit' })
    execSync('.venv\\Scripts\\pip.exe install -r requirements.txt -q', {
      cwd: dir,
      stdio: 'inherit',
      shell: process.platform === 'win32' ? 'cmd.exe' : undefined,
    })
  } catch (err) {
    console.warn(
      '[process-manager] excel-bridge 依赖安装失败，可手动执行: cd agents/excel-bridge && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt',
      err,
    )
  }
}



/** 首次启动时从 example 生成 config.json */
function ensureXiangyuConfig(root: string): void {
  const configPath = path.join(root, 'config.json')
  const examplePath = path.join(root, 'config.example.json')
  if (!fs.existsSync(configPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, configPath)
    console.log('[process-manager] 已生成 apps/xiangyu/config.json')
  }
}

/** 同步祥钰 bridge 与订单 Cookie 配置 */
function syncXiangyuBridgeConfig(root: string): XiangyuBridgeConfig {
  const resolved = getXiangyuBridgeConfig()
  const outboundConfigPath = getOutboundConfigPath()
  const configPath = path.join(root, 'config.json')
  if (!fs.existsSync(configPath)) return resolved
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      bridge?: { url?: string; devtoolsPort?: number; qianfanDataDir?: string }
      orders?: { importFrom?: string }
    }
    const bridge = { ...cfg.bridge }
    const orders = { ...cfg.orders }
    let changed = false
    if (bridge.url !== resolved.bridgeUrl) {
      bridge.url = resolved.bridgeUrl
      changed = true
    }
    if (!bridge.devtoolsPort || bridge.devtoolsPort === 4730 || bridge.devtoolsPort !== resolved.devtoolsPort) {
      bridge.devtoolsPort = resolved.devtoolsPort
      changed = true
    }
    if (!bridge.qianfanDataDir?.trim() || bridge.qianfanDataDir.includes('apps\\千帆')) {
      bridge.qianfanDataDir = resolved.qianfanDataDir
      changed = true
    }
    if (orders.importFrom !== outboundConfigPath) {
      orders.importFrom = outboundConfigPath
      changed = true
    }
    if (changed) {
      cfg.bridge = bridge
      cfg.orders = orders
      fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
      console.log(`[process-manager] 已同步祥钰配置: DevTools ${resolved.devtoolsPort}, 订单 Cookie ${outboundConfigPath}`)
    }
    return resolved
  } catch (err) {
    console.warn('[process-manager] 同步祥钰 config.json 失败:', err)
    return resolved
  }
}



export function startExcelBridgeProcess(): void {

  if (shuttingDown) return

  if (process.platform !== 'win32') {

    console.log('[process-manager] 非 Windows，跳过 Excel 桥接自启动')

    return

  }



  const dir = bridgeDir()

  const script = path.join(dir, 'bridge.py')

  if (!fs.existsSync(script)) {

    console.warn('[process-manager] 未找到 excel-bridge，跳过自启动')

    return

  }



  if (bridgeProc) return

  bridgeManualStop = false
  bridgeRestartTimer = clearRestartTimer(bridgeRestartTimer)

  ensureExcelBridgeVenv()

  const port = getExcelBridgePort()

  const py = bridgePython()

  console.log(`[process-manager] 启动 Excel 桥接子进程 (端口 ${port})...`)

  bridgeProc = spawn(py, [script], {

    cwd: dir,

    stdio: 'inherit',

    env: { ...process.env, EXCEL_BRIDGE_PORT: String(port) },

  })

  bridgeStableTimer = clearRestartTimer(bridgeStableTimer)
  bridgeStableTimer = armStableReset(() => {
    bridgeRestartAttempts = 0
    bridgeStableTimer = null
  })

  bridgeProc.on('exit', (code) => {

    bridgeProc = null
    bridgeStableTimer = clearRestartTimer(bridgeStableTimer)

    if (shuttingDown || bridgeManualStop) {
      console.log(`[process-manager] Excel 桥接退出 code=${code}（已停止，不重启）`)
      return
    }

    console.warn(`[process-manager] Excel 桥接异常退出 code=${code}`)

    bridgeRestartTimer = clearRestartTimer(bridgeRestartTimer)
    const timerRef = { current: bridgeRestartTimer }
    scheduleProcessRestart(
      'Excel 桥接',
      bridgeRestartAttempts,
      timerRef,
      () => bridgeManualStop || shuttingDown,
      startExcelBridgeProcess,
    )
    bridgeRestartTimer = timerRef.current
    bridgeRestartAttempts++

  })

}



export function startPrintAgentProcess(): void {

  if (shuttingDown) return

  if (process.platform !== 'win32') {

    console.log('[process-manager] 非 Windows，跳过打印 Agent 自启动')

    return

  }



  const dir = printAgentDir()

  const script = path.join(dir, 'agent.py')

  if (!fs.existsSync(script)) {

    console.warn('[process-manager] 未找到 print-agent，跳过自启动')

    return

  }



  if (printAgentProc) return

  printAgentManualStop = false
  printAgentRestartTimer = clearRestartTimer(printAgentRestartTimer)

  ensurePrintAgentVenv()

  const port = getPrintAgentPort()
  if (findListeningPids(port).length && pingPrintAgentHealthSync(port)) {
    console.log('[process-manager] 打印 Agent 已在运行，跳过重复启动')
    return
  }
  ensurePrintAgentPortFree()

  const py = printAgentPython()

  console.log(`[process-manager] 启动打印 Agent (端口 ${port}, 璞趣 AQ00 TSPL)...`)

  printAgentProc = spawn(py, [script], {

    cwd: dir,

    stdio: 'inherit',

    env: { ...process.env, PRINT_AGENT_PORT: String(port) },

  })

  printAgentStableTimer = clearRestartTimer(printAgentStableTimer)
  printAgentStableTimer = armStableReset(() => {
    printAgentRestartAttempts = 0
    printAgentStableTimer = null
  })

  printAgentProc.on('exit', (code) => {

    printAgentProc = null
    printAgentStableTimer = clearRestartTimer(printAgentStableTimer)

    if (shuttingDown || printAgentManualStop) {
      console.log(`[process-manager] 打印 Agent 退出 code=${code}（已停止，不重启）`)
      return
    }

    console.warn(`[process-manager] 打印 Agent 异常退出 code=${code}`)

    printAgentRestartTimer = clearRestartTimer(printAgentRestartTimer)
    const timerRef = { current: printAgentRestartTimer }
    scheduleProcessRestart(
      '打印 Agent',
      printAgentRestartAttempts,
      timerRef,
      () => printAgentManualStop || shuttingDown,
      startPrintAgentProcess,
    )
    printAgentRestartTimer = timerRef.current
    printAgentRestartAttempts++

  })

}



function startXiangyuWeb(root: string): void {

  if (shuttingDown) return

  const script = path.join(root, 'server/index.js')

  if (!fs.existsSync(script)) {

    console.warn(`[process-manager] 祥钰 Web 脚本不存在: ${script}`)

    return

  }

  if (xiangyuWebProc) return

  xiangyuWebManualStop = false
  xiangyuWebRestartTimer = clearRestartTimer(xiangyuWebRestartTimer)

  const port = getXiangyuPort()

  console.log(`[process-manager] 启动祥钰 Web (端口 ${port})...`)

  xiangyuWebProc = spawn(process.execPath, [script], {

    cwd: root,

    stdio: 'inherit',

    env: {
      ...process.env,
      PORT: String(port),
      OUTBOUND_CONFIG_PATH: getOutboundConfigPath(),
    },

  })

  xiangyuWebStableTimer = clearRestartTimer(xiangyuWebStableTimer)
  xiangyuWebStableTimer = armStableReset(() => {
    xiangyuWebRestartAttempts = 0
    xiangyuWebStableTimer = null
  })

  xiangyuWebProc.on('exit', (code) => {

    xiangyuWebProc = null
    xiangyuWebStableTimer = clearRestartTimer(xiangyuWebStableTimer)

    if (shuttingDown || xiangyuWebManualStop) {
      console.log(`[process-manager] 祥钰 Web 退出 code=${code}（已停止，不重启）`)
      return
    }

    console.warn(`[process-manager] 祥钰 Web 异常退出 code=${code}`)

    xiangyuWebRestartTimer = clearRestartTimer(xiangyuWebRestartTimer)
    const timerRef = { current: xiangyuWebRestartTimer }
    scheduleProcessRestart(
      '祥钰 Web',
      xiangyuWebRestartAttempts,
      timerRef,
      () => xiangyuWebManualStop || shuttingDown,
      () => startXiangyuWeb(root),
    )
    xiangyuWebRestartTimer = timerRef.current
    xiangyuWebRestartAttempts++

  })

}



function startXiangyuBridge(root: string, bridgeCfg: XiangyuBridgeConfig): void {

  if (shuttingDown) return

  const script = path.join(root, 'scripts/bridge-relay.js')

  if (!fs.existsSync(script)) {

    console.warn(`[process-manager] 祥钰 Bridge 脚本不存在: ${script}`)

    return

  }

  if (xiangyuBridgeProc) return

  xiangyuBridgeManualStop = false
  xiangyuBridgeRestartTimer = clearRestartTimer(xiangyuBridgeRestartTimer)

  const bridgePort = getXiangyuBridgePort()
  const devtoolsPort = bridgeCfg.devtoolsPort
  console.log(`[process-manager] 启动祥钰 Bridge (端口 ${bridgePort}, 千帆 DevTools ${devtoolsPort})...`)
  xiangyuBridgeProc = spawn(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      BRIDGE_PORT: String(bridgePort),
      DEVTOOLS_PORT: String(devtoolsPort),
      QIANFAN_DATA_DIR: bridgeCfg.qianfanDataDir,
    },
  })

  xiangyuBridgeStableTimer = clearRestartTimer(xiangyuBridgeStableTimer)
  xiangyuBridgeStableTimer = armStableReset(() => {
    xiangyuBridgeRestartAttempts = 0
    xiangyuBridgeStableTimer = null
  })

  xiangyuBridgeProc.on('exit', (code) => {

    xiangyuBridgeProc = null
    xiangyuBridgeStableTimer = clearRestartTimer(xiangyuBridgeStableTimer)

    if (shuttingDown || xiangyuBridgeManualStop) {
      console.log(`[process-manager] 祥钰 Bridge 退出 code=${code}（已停止，不重启）`)
      return
    }

    console.warn(`[process-manager] 祥钰 Bridge 异常退出 code=${code}`)

    xiangyuBridgeRestartTimer = clearRestartTimer(xiangyuBridgeRestartTimer)
    const timerRef = { current: xiangyuBridgeRestartTimer }
    scheduleProcessRestart(
      '祥钰 Bridge',
      xiangyuBridgeRestartAttempts,
      timerRef,
      () => xiangyuBridgeManualStop || shuttingDown,
      () => startXiangyuBridge(root, bridgeCfg),
    )
    xiangyuBridgeRestartTimer = timerRef.current
    xiangyuBridgeRestartAttempts++

  })

}



export function startXiangyuProcesses(): void {

  if (shuttingDown) return

  if (!isXiangyuEnabled()) {

    console.log('[process-manager] 祥钰系统已禁用 (XIANGYU_ENABLED=false)')

    return

  }



  const root = getXiangyuRoot()

  const bridgeCfg = syncXiangyuBridgeConfig(root)

  const serverScript = path.join(root, 'server/index.js')

  if (!fs.existsSync(serverScript)) {

    console.warn(`[process-manager] 未找到祥钰系统目录: ${root}`)

    return

  }



  ensureXiangyuConfig(root)

  startXiangyuWeb(root)

  startXiangyuBridge(root, bridgeCfg)

}



export function stopExcelBridgeProcess(): void {

  bridgeManualStop = true
  bridgeRestartAttempts = 0
  bridgeRestartTimer = clearRestartTimer(bridgeRestartTimer)
  bridgeStableTimer = clearRestartTimer(bridgeStableTimer)

  if (bridgeProc) {

    try { bridgeProc.kill() } catch { /* ignore */ }

    bridgeProc = null

  }

}



export function stopPrintAgentProcess(): void {

  printAgentManualStop = true
  printAgentRestartAttempts = 0
  printAgentRestartTimer = clearRestartTimer(printAgentRestartTimer)
  printAgentStableTimer = clearRestartTimer(printAgentStableTimer)

  if (printAgentProc) {

    try { printAgentProc.kill() } catch { /* ignore */ }

    printAgentProc = null

  }

}



export function stopXiangyuProcesses(): void {

  xiangyuWebManualStop = true
  xiangyuBridgeManualStop = true
  xiangyuWebRestartAttempts = 0
  xiangyuBridgeRestartAttempts = 0
  xiangyuWebRestartTimer = clearRestartTimer(xiangyuWebRestartTimer)
  xiangyuBridgeRestartTimer = clearRestartTimer(xiangyuBridgeRestartTimer)
  xiangyuWebStableTimer = clearRestartTimer(xiangyuWebStableTimer)
  xiangyuBridgeStableTimer = clearRestartTimer(xiangyuBridgeStableTimer)

  if (xiangyuWebProc) {

    try { xiangyuWebProc.kill() } catch { /* ignore */ }

    xiangyuWebProc = null

  }

  if (xiangyuBridgeProc) {

    try { xiangyuBridgeProc.kill() } catch { /* ignore */ }

    xiangyuBridgeProc = null

  }

}

