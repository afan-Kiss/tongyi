/** 打印失败时的弹窗标题与正文（含处理步骤） */

const FALLBACK_SOLUTIONS = [
  '到设置页查看「打印 Agent」是否在线，并试「吊牌测试打印」',
  '确认璞趣桌面已打开、PUQU 打印机已连接有纸',
  '仍不行：stop.bat → start.bat 完整重启',
]

function classifyLocal(raw: string): string[] {
  const msg = raw.toLowerCase()
  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('abort') || msg.includes('超时')) {
    return [
      '确认璞趣桌面软件已打开，且打印机 PUQU 已连接、有纸',
      '在 Windows「设备和打印机」里取消卡住的打印任务',
      '若仍失败：关闭启动窗口后重新运行 start.bat',
    ]
  }
  if (msg.includes('agent') || msg.includes('4729') || msg.includes('无响应') || msg.includes('离线')) {
    return [
      '系统会自动尝试重启打印 Agent；稍等几秒后重试',
      '打开设置页，看「打印 Agent」是否在线',
      '若仍离线：运行 stop.bat 再 start.bat',
    ]
  }
  if (msg.includes('未找到打印机')) {
    return [
      '在设置页填写 Windows「设备和打印机」里璞趣机的准确名称（如 PUQU）',
      '确认 USB 已连接、驱动已安装',
    ]
  }
  if (msg.includes('璞趣') || msg.includes('pqapi') || msg.includes('6780')) {
    return [
      '打开璞趣标签桌面软件并保持运行',
      '标签纸尺寸设为 宽 25mm × 长 70mm',
    ]
  }
  return FALLBACK_SOLUTIONS
}

export class PrintRequestError extends Error {
  solutions: string[]

  constructor(message: string, solutions?: string[]) {
    super(message)
    this.name = 'PrintRequestError'
    this.solutions = solutions?.length ? solutions : classifyLocal(message)
  }
}

export function formatPrintFailureDialog(e: unknown): { title: string; message: string } {
  if (e instanceof PrintRequestError) {
    return {
      title: '打印失败',
      message: buildPrintFailureMessage(e.message, e.solutions),
    }
  }
  const raw = e instanceof Error ? e.message : String(e)
  return {
    title: '打印失败',
    message: buildPrintFailureMessage(raw, classifyLocal(raw)),
  }
}

function buildPrintFailureMessage(reason: string, solutions: string[]): string {
  const steps = solutions.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return `${reason}\n\n可按以下步骤处理：\n${steps}`
}
