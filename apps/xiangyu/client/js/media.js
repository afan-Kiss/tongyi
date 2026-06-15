/** 是否移动端 */
export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent || '');
}

/** 是否可用 getUserMedia 实时预览（HTTPS / localhost） */
export function canUseLiveCamera() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.isSecureContext);
}

export function liveCameraBlockedReason() {
  if (window.isSecureContext) return '';
  if (isMobileDevice()) {
    return '当前为 HTTP 访问，手机无法实时预览连拍。请改用 HTTPS 访问，或用「从相册选图」。';
  }
  return '';
}
