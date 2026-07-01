import { prisma } from '../../lib/prisma'
import { getAgentOverview } from '../agent/agent.service'
import { getSystemStatus } from '../../services/settings.service'
import { upsertQianfanRelayStatusSnapshot } from '../qianfan-relay/qianfanRelay.status'
import { detectRuntimeMode, resolveJizhangWebUrlEffective, resolveZhuboAnalysisWebUrlEffective } from '../system-discovery/systemDiscovery.service'

async function checkRemoteWeb(url: string, timeoutMs = 2000): Promise<{ online: boolean; message: string }> {
  if (!url) return { online: false, message: '未配置地址' }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return {
      online: res.ok || res.status < 500,
      message: res.ok ? '连接正常' : `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      online: false,
      message: err instanceof Error ? err.message : '连接失败',
    }
  }
}

export async function getPortalOverview() {
  const [systemStatus, agentOverview, qianfanSnapshot, jizhangUrl, zhuboUrl, runtimeMode, moduleRows] =
    await Promise.all([
      getSystemStatus(),
      getAgentOverview(),
      upsertQianfanRelayStatusSnapshot().catch(() => null),
      resolveJizhangWebUrlEffective(),
      resolveZhuboAnalysisWebUrlEffective(),
      detectRuntimeMode(),
      prisma.systemModuleStatus.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 }),
    ])

  const [jizhangCheck, zhuboCheck] = await Promise.all([
    checkRemoteWeb(jizhangUrl),
    checkRemoteWeb(zhuboUrl),
  ])

  const recentErrors: { module: string; message: string; at: string }[] = []
  if (systemStatus.degradedReasons?.length) {
    for (const msg of systemStatus.degradedReasons) {
      recentErrors.push({ module: '库存系统', message: msg, at: new Date().toISOString() })
    }
  }
  if (qianfanSnapshot?.lastError) {
    recentErrors.push({
      module: '千帆客服',
      message: qianfanSnapshot.lastError,
      at: new Date().toISOString(),
    })
  }
  if (!agentOverview.hasOnlineAgent) {
    recentErrors.push({
      module: '本地助手',
      message: '本地助手离线',
      at: new Date().toISOString(),
    })
  }

  return {
    inventory: {
      degraded: systemStatus.degraded,
      degradedReasons: systemStatus.degradedReasons,
      excelBridge: systemStatus.excelBridge,
      printAgent: systemStatus.printAgent,
    },
    qianfan: qianfanSnapshot,
    agent: agentOverview,
    accounting: {
      url: jizhangUrl,
      proxyPath: '/jizhang-proxy',
      ...jizhangCheck,
      plainMessage: jizhangCheck.online ? '记账系统连接正常' : '记账系统暂时连不上，不影响扫码出库',
    },
    liveAnalysis: {
      url: zhuboUrl,
      proxyPath: '/zhubo-proxy',
      ...zhuboCheck,
      plainMessage: zhuboCheck.online ? '主播分析连接正常' : '主播分析暂时连不上，不影响扫码出库',
    },
    runtimeMode,
    modules: moduleRows.map((row) => ({
      moduleKey: row.moduleKey,
      moduleName: row.moduleName,
      status: row.status,
      message: row.message,
      updatedAt: row.updatedAt.toISOString(),
    })),
    recentErrors,
  }
}
