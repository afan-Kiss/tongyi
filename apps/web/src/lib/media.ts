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
    return '当前为 HTTP 访问，手机无法实时预览连拍。请改用 HTTPS 外网地址扫码，或用「从相册选图」。'
  }
  return ''
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

export function captureVideoFrame(video: HTMLVideoElement, maxSide = 1280, quality = 0.82): string | null {
  if (!video.videoWidth) return null
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.height))
  const w = Math.max(1, Math.round(video.videoWidth * scale))
  const h = Math.max(1, Math.round(video.videoHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function normalizePhotoDataUrl(dataUrl: string, maxSide = 1280): Promise<string> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  if (scale >= 1 && dataUrl.includes('image/jpeg') && Math.max(img.width, img.height) <= maxSide) {
    return dataUrl
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.82)
}
