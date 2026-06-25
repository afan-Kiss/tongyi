/** 是否移动端 */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent || '')
}

/** 是否可用 getUserMedia 实时预览（HTTPS / localhost） */
export function canUseLiveCamera(): boolean {
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      window.isSecureContext,
  )
}

export function liveCameraBlockedReason(): string {
  if (window.isSecureContext) return ''
  if (isMobileDevice()) {
    return 'HTTP 下手机无法打开实时摄像头。请扫电脑上的 HTTPS 二维码（内网 4730 端口），首次需在浏览器点「高级」→「继续访问」信任证书。'
  }
  return ''
}

/** 正式拍照：不缩小边长，JPEG 最高质量（canvas 上限 1.0） */
export const PHOTO_CAPTURE_MAX_SIDE = 8192
export const PHOTO_CAPTURE_QUALITY = 1

/** 电脑端实时预览推流：公网走小图省流量，内网适中画质保流畅 */
export const PHOTO_PREVIEW_REMOTE_MAX_SIDE = 480
export const PHOTO_PREVIEW_REMOTE_QUALITY = 0.55
export const PHOTO_PREVIEW_REMOTE_INTERVAL_MS = 280
export const PHOTO_PREVIEW_REMOTE_POLL_MS = 300
/** 内网预览：640px / 68% / ~15–20fps（HTTP 逐帧 JPEG，无法做到 60fps；正式拍照仍全画质） */
export const PHOTO_PREVIEW_LAN_MAX_SIDE = 640
export const PHOTO_PREVIEW_LAN_QUALITY = 0.68
export const PHOTO_PREVIEW_LAN_INTERVAL_MS = 50
export const PHOTO_PREVIEW_LAN_POLL_MS = 33

/** @deprecated 使用 isLanPhotoRelay 分支 */
export const PHOTO_PREVIEW_MAX_SIDE = PHOTO_PREVIEW_REMOTE_MAX_SIDE
/** @deprecated 使用 isLanPhotoRelay 分支 */
export const PHOTO_PREVIEW_QUALITY = PHOTO_PREVIEW_REMOTE_QUALITY

export function isLanPhotoRelay(): boolean {
  if (typeof window === 'undefined') return true
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
  if (/^192\.168\./.test(host) || /^10\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  return window.location.port === '4730'
}

export function photoRelayPreviewParams(): { maxSide: number; quality: number; intervalMs: number } {
  if (isLanPhotoRelay()) {
    return {
      maxSide: PHOTO_PREVIEW_LAN_MAX_SIDE,
      quality: PHOTO_PREVIEW_LAN_QUALITY,
      intervalMs: PHOTO_PREVIEW_LAN_INTERVAL_MS,
    }
  }
  return {
    maxSide: PHOTO_PREVIEW_REMOTE_MAX_SIDE,
    quality: PHOTO_PREVIEW_REMOTE_QUALITY,
    intervalMs: PHOTO_PREVIEW_REMOTE_INTERVAL_MS,
  }
}

export function photoRelayPollIntervalMs(): number {
  return isLanPhotoRelay() ? PHOTO_PREVIEW_LAN_POLL_MS : PHOTO_PREVIEW_REMOTE_POLL_MS
}

/** 上一帧仍在推送时的重试间隔 */
export function photoRelayPushBusyRetryMs(): number {
  return isLanPhotoRelay() ? 16 : 32
}

/** 实时推流用较低分辨率，减轻手机端预览卡顿；takePhoto 仍走全传感器 */
export const PREVIEW_STREAM_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 1280 },
}

/** 请求摄像头时尽量要最高分辨率（实际由设备决定） */
export const HIGH_RES_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 4096 },
  height: { ideal: 4096 },
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/data:(.*);base64/)?.[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
  timeoutMs = 8000,
): Promise<void> {
  video.srcObject = stream
  await video.play().catch(() => {})
  if (video.readyState >= 2) return
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('摄像头加载超时')), timeoutMs)
    const done = () => {
      window.clearTimeout(timer)
      resolve()
    }
    video.onloadeddata = done
    video.onloadedmetadata = done
  })
}

export async function startLiveCamera(
  video: HTMLVideoElement,
  timeoutMs = 8000,
): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null
  const stream = await navigator.mediaDevices.getUserMedia({
    video: HIGH_RES_VIDEO_CONSTRAINTS,
    audio: false,
  })
  await attachStreamToVideo(video, stream, timeoutMs)
  return stream
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  maxSide = PHOTO_CAPTURE_MAX_SIDE,
  quality = PHOTO_CAPTURE_QUALITY,
): string | null {
  if (!video.videoWidth) return null
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
  const w = Math.max(1, Math.round(video.videoWidth * scale))
  const h = Math.max(1, Math.round(video.videoHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/** 正式拍照：优先 ImageCapture 原生快门（全传感器分辨率），否则 canvas 原生尺寸最高质量 */
export async function capturePhotoFromStream(
  video: HTMLVideoElement,
  stream?: MediaStream | null,
): Promise<string | null> {
  const track = stream?.getVideoTracks()[0]
  if (track && typeof ImageCapture !== 'undefined') {
    try {
      const ic = new ImageCapture(track)
      const blob = await ic.takePhoto()
      return blobToDataUrl(blob)
    } catch {
      /* 部分浏览器不支持 takePhoto，回退 canvas */
    }
  }
  return captureVideoFrame(video, PHOTO_CAPTURE_MAX_SIDE, PHOTO_CAPTURE_QUALITY)
}

export function capturePreviewFrame(video: HTMLVideoElement): string | null {
  const { maxSide, quality } = photoRelayPreviewParams()
  return captureVideoFrame(video, maxSide, quality)
}

export type NormalizePhotoOptions = {
  maxSide?: number
  quality?: number
  /** true 时不二次编码，原样返回 */
  preserve?: boolean
}

export async function normalizePhotoDataUrl(
  dataUrl: string,
  options?: NormalizePhotoOptions,
): Promise<string> {
  if (options?.preserve) return dataUrl

  const maxSide = options?.maxSide ?? PHOTO_CAPTURE_MAX_SIDE
  const quality = options?.quality ?? PHOTO_CAPTURE_QUALITY

  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  if (scale >= 1 && dataUrl.includes('image/jpeg') && quality >= 1) {
    return dataUrl
  }
  if (scale >= 1 && dataUrl.includes('image/jpeg') && Math.max(img.width, img.height) <= maxSide) {
    if (quality >= PHOTO_CAPTURE_QUALITY) return dataUrl
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
