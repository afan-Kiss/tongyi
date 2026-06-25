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
  isXiangyuEnabled,
} from '../config/env'

import { ensurePrintAgentPortFree } from '../lib/kill-port'



let bridgeProc: ChildProcess | null = null

let printAgentProc: ChildProcess | null = null

let bridgeRestartTimer: ReturnType<typeof setTimeout> | null = null

let printAgentRestartTimer: ReturnType<typeof setTimeout> | null = null



let xiangyuWebProc: ChildProcess | null = null

let xiangyuBridgeProc: ChildProcess | null = null

let xiangyuWebRestartTimer: ReturnType<typeof setTimeout> | null = null

let xiangyuBridgeRestartTimer: ReturnType<typeof setTimeout> | null = null



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

  const venvPy = path.join(bridgeDir(), '.venv', 'Scripts', 'python.exe')

  if (fs.existsSync(venvPy)) return venvPy

  return 'python'

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



  const port = getExcelBridgePort()

  const py = bridgePython()

  console.log(`[process-manager] 启动 Excel 桥接子进程 (端口 ${port})...`)

  bridgeProc = spawn(py, [script], {

    cwd: dir,

    stdio: 'inherit',

    env: { ...process.env, EXCEL_BRIDGE_PORT: String(port) },

  })



  bridgeProc.on('exit', (code) => {

    bridgeProc = null

    console.warn(`[process-manager] Excel 桥接退出 code=${code}，5秒后重启...`)

    bridgeRestartTimer = setTimeout(() => {

      bridgeRestartTimer = null

      startExcelBridgeProcess()

    }, 5000)

  })

}



export function startPrintAgentProcess(): void {

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

  ensurePrintAgentVenv()
  ensurePrintAgentPortFree()

  const port = Number(process.env.PRINT_AGENT_PORT || 4729)

  const py = printAgentPython()

  console.log(`[process-manager] 启动打印 Agent (端口 ${port}, 璞趣 AQ00 TSPL)...`)

  printAgentProc = spawn(py, [script], {

    cwd: dir,

    stdio: 'inherit',

    env: { ...process.env, PRINT_AGENT_PORT: String(port) },

  })



  printAgentProc.on('exit', (code) => {

    printAgentProc = null

    console.warn(`[process-manager] 打印 Agent 退出 code=${code}，5秒后重启...`)

    printAgentRestartTimer = setTimeout(() => {

      printAgentRestartTimer = null

      startPrintAgentProcess()

    }, 5000)

  })

}



function startXiangyuWeb(root: string): void {

  const script = path.join(root, 'server/index.js')

  if (!fs.existsSync(script)) {

    console.warn(`[process-manager] 祥钰 Web 脚本不存在: ${script}`)

    return

  }

  if (xiangyuWebProc) return



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



  xiangyuWebProc.on('exit', (code) => {

    xiangyuWebProc = null

    console.warn(`[process-manager] 祥钰 Web 退出 code=${code}，5秒后重启...`)

    xiangyuWebRestartTimer = setTimeout(() => {

      xiangyuWebRestartTimer = null

      startXiangyuWeb(root)

    }, 5000)

  })

}



function startXiangyuBridge(root: string, bridgeCfg: XiangyuBridgeConfig): void {

  const script = path.join(root, 'scripts/bridge-relay.js')

  if (!fs.existsSync(script)) {

    console.warn(`[process-manager] 祥钰 Bridge 脚本不存在: ${script}`)

    return

  }

  if (xiangyuBridgeProc) return



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



  xiangyuBridgeProc.on('exit', (code) => {

    xiangyuBridgeProc = null

    console.warn(`[process-manager] 祥钰 Bridge 退出 code=${code}，5秒后重启...`)

    xiangyuBridgeRestartTimer = setTimeout(() => {

      xiangyuBridgeRestartTimer = null

      startXiangyuBridge(root, bridgeCfg)

    }, 5000)

  })

}



export function startXiangyuProcesses(): void {

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

  if (bridgeRestartTimer) clearTimeout(bridgeRestartTimer)

  if (bridgeProc) {

    try { bridgeProc.kill() } catch { /* ignore */ }

    bridgeProc = null

  }

}



export function stopPrintAgentProcess(): void {

  if (printAgentRestartTimer) clearTimeout(printAgentRestartTimer)

  if (printAgentProc) {

    try { printAgentProc.kill() } catch { /* ignore */ }

    printAgentProc = null

  }

}



export function stopXiangyuProcesses(): void {

  if (xiangyuWebRestartTimer) clearTimeout(xiangyuWebRestartTimer)

  if (xiangyuBridgeRestartTimer) clearTimeout(xiangyuBridgeRestartTimer)

  if (xiangyuWebProc) {

    try { xiangyuWebProc.kill() } catch { /* ignore */ }

    xiangyuWebProc = null

  }

  if (xiangyuBridgeProc) {

    try { xiangyuBridgeProc.kill() } catch { /* ignore */ }

    xiangyuBridgeProc = null

  }

}


