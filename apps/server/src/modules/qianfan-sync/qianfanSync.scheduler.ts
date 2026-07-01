/**
 * 定时同步预留（第一版仅手动触发，此处注册占位）
 */
import type { QianfanSyncType } from './qianfanSync.types'

export interface SchedulerConfig {
  ordersMinutes?: number
  afterSalesMinutes?: number
  reviewsMinutes?: number
  liveDaily?: boolean
}

let timer: NodeJS.Timeout | null = null

export function stopQianfanSyncScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function startQianfanSyncScheduler(_config: SchedulerConfig, _runner: (type: QianfanSyncType) => Promise<void>) {
  stopQianfanSyncScheduler()
  // 预留：后续按 config 注册 interval
}
