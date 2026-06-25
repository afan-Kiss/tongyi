/** 统计最近 1 秒内帧数，用于实时预览 FPS 显示 */
export class RelayFpsMeter {
  private times: number[] = []

  tick(): number {
    const now = Date.now()
    this.times.push(now)
    while (this.times.length && this.times[0] < now - 1000) this.times.shift()
    if (this.times.length < 2) return 0
    const span = now - this.times[0]
    if (span <= 0) return 0
    return Math.round(((this.times.length - 1) * 1000) / span)
  }

  reset(): void {
    this.times = []
  }
}
