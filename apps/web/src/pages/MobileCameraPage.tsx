import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { api } from '@/lib/api'
import {
  attachStreamToVideo,
  canUseLiveCamera,
  capturePhotoFromStream,
  capturePreviewFrame,
  PREVIEW_STREAM_VIDEO_CONSTRAINTS,
  liveCameraBlockedReason,
  photoRelayPreviewParams,
  isLanPhotoRelay,
} from '@/lib/media'
import { RelayFpsMeter } from '@/lib/relayStreamFps'

export const MobileCameraPage: React.FC = () => {
  const [params] = useSearchParams()
  const sessionId = params.get('s') || ''

  const [certNo, setCertNo] = useState('')
  const [status, setStatus] = useState('正在连接…')
  const [cameraActive, setCameraActive] = useState(false)
  const [openingCamera, setOpeningCamera] = useState(false)
  const [flash, setFlash] = useState(false)
  const [shooting, setShooting] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pushingRef = useRef(false)
  const pushFpsMeterRef = useRef(new RelayFpsMeter())
  const [pushFps, setPushFps] = useState(0)
  const prevCertRef = useRef('')
  const certNoRef = useRef('')
  const cameraActiveRef = useRef(false)
  const openingCameraRef = useRef(false)
  const cameraBlockedHint = liveCameraBlockedReason()

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    cameraActiveRef.current = false
    setCameraActive(false)
  }, [])

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('当前浏览器不支持摄像头')
      return false
    }
    stopStream()
    const video = videoRef.current
    if (!video) return false
    setCameraActive(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: PREVIEW_STREAM_VIDEO_CONSTRAINTS,
        audio: false,
      })
      streamRef.current = stream
      await attachStreamToVideo(video, stream, 8000)
      cameraActiveRef.current = true
      setCameraActive(true)
      return true
    } catch {
      stopStream()
      setStatus(cameraBlockedHint || '无法打开摄像头，请改用 HTTPS 访问')
      return false
    }
  }, [cameraBlockedHint, stopStream])

  const applyCertNo = useCallback((next: string) => {
    const code = next.trim().toUpperCase()
    if (code === certNoRef.current) return
    certNoRef.current = code
    setCertNo(code)
    if (openingCameraRef.current) return
    if (!code) {
      setStatus('等待电脑填写编号…')
      return
    }
    if (prevCertRef.current && prevCertRef.current !== code) {
      setStatus(`已切换至 ${code}，可继续拍照`)
    } else if (cameraActiveRef.current) {
      setStatus(`编号 ${code} · 点下方按钮拍照`)
    }
    prevCertRef.current = code
  }, [])

  const onReopenCamera = useCallback(async () => {
    if (openingCameraRef.current) return
    openingCameraRef.current = true
    setOpeningCamera(true)
    setStatus('正在打开摄像头…')
    try {
      const ok = await startCamera()
      if (ok) {
        const code = certNoRef.current
        setStatus(code ? `编号 ${code} · 点下方按钮拍照` : '等待电脑填写编号…')
      }
    } finally {
      openingCameraRef.current = false
      setOpeningCamera(false)
    }
  }, [startCamera])

  useEffect(() => {
    if (!sessionId) {
      setStatus('缺少会话参数，请从电脑端扫码进入')
      return
    }
    let cancelled = false
    const connectTimer = window.setTimeout(() => {
      if (!cancelled) {
        setStatus('连接超时：请确认与电脑同一网络；微信扫码请点「…」→ 在浏览器打开')
      }
    }, 15000)
    ;(async () => {
      try {
        const r = await api.getPhotoRelaySession(sessionId)
        if (cancelled) return
        window.clearTimeout(connectTimer)
        applyCertNo(r.data.certNo)
        setStatus(r.data.certNo ? `编号 ${r.data.certNo} · 正在打开摄像头…` : '正在打开摄像头…')
        const ok = await startCamera()
        if (!cancelled && ok) {
          const code = r.data.certNo || certNoRef.current
          setStatus(code ? `编号 ${code} · 点下方按钮拍照` : '等待电脑填写编号…')
        }
      } catch (e) {
        if (!cancelled) {
          window.clearTimeout(connectTimer)
          const msg = e instanceof Error ? e.message : '会话无效或已过期'
          setStatus(msg.includes('abort') || msg.includes('Abort') ? '连接超时，请检查网络或在浏览器中打开' : msg)
        }
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(connectTimer)
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 sessionId 变化时初始化
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || !cameraActive) return
    const { intervalMs } = photoRelayPreviewParams()
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const video = videoRef.current
      if (!video?.videoWidth) {
        window.setTimeout(tick, intervalMs)
        return
      }
      const frame = capturePreviewFrame(video)
      if (frame && !pushingRef.current) {
        pushingRef.current = true
        void api
          .pushPhotoRelayFrame(sessionId, frame)
          .then(() => {
            if (isLanPhotoRelay()) setPushFps(pushFpsMeterRef.current.tick())
          })
          .catch(() => {})
          .finally(() => {
            pushingRef.current = false
          })
      }
      window.setTimeout(tick, intervalMs)
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [sessionId, cameraActive])

  useEffect(() => {
    if (!sessionId) return
    const tick = async () => {
      try {
        const r = await api.heartbeatPhotoRelay(sessionId, 'phone')
        applyCertNo(r.data.certNo)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const timer = window.setInterval(tick, 2000)
    return () => window.clearInterval(timer)
  }, [sessionId, applyCertNo])

  const onShoot = async () => {
    if (!sessionId || shooting) return
    const code = certNoRef.current
    if (!code) {
      setStatus('请先在电脑填写编号')
      return
    }
    const video = videoRef.current
    if (!video?.videoWidth) {
      setStatus('摄像头未就绪')
      return
    }
    setShooting(true)
    try {
      const photo = await capturePhotoFromStream(video, streamRef.current)
      if (!photo) throw new Error('拍照失败')
      await api.shootPhotoRelay(sessionId, photo)
      setFlash(true)
      window.setTimeout(() => setFlash(false), 180)
      if (navigator.vibrate) navigator.vibrate(20)
      setStatus(`已拍 ${code}，电脑端同步显示`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setShooting(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-900 px-6 text-center text-slate-300">
        <Camera size={48} className="mb-4 opacity-70" />
        <p className="text-sm leading-relaxed">请先在电脑「标签入库」页扫描二维码（只需扫一次，可连续录入）</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-hidden bg-slate-900 text-white">
      <header className="shrink-0 px-4 py-3 text-center">
        <p className="text-xs text-slate-400">手机拍照 · 保持此页开启，换编号不用重扫</p>
        {/MicroMessenger/i.test(navigator.userAgent) && (
          <p className="mt-1 text-[10px] leading-relaxed text-sky-300">
            若一直转圈：点右上角 ··· → 在浏览器中打开
          </p>
        )}
        {window.isSecureContext && window.location.protocol === 'https:' && !window.location.hostname.includes('duckdns') && (
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            内网 HTTPS：若摄像头打不开，先点浏览器「高级」→「继续访问」信任证书
          </p>
        )}
        {certNo ? (
          <p className="mt-1 text-sm font-semibold tracking-wider">{certNo}</p>
        ) : (
          <p className="mt-1 text-sm text-amber-300">等待电脑填写编号</p>
        )}
      </header>

      {cameraBlockedHint && (
        <p className="mx-4 mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          {cameraBlockedHint}
        </p>
      )}

      <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-slate-400">
            <Camera size={40} className="mb-3 opacity-70" />
            <p className="text-sm">{status}</p>
            {canUseLiveCamera() && (
              <button
                type="button"
                disabled={openingCamera}
                onClick={() => void onReopenCamera()}
                className="mt-4 rounded-full bg-white/10 px-5 py-2 text-sm disabled:opacity-50"
              >
                {openingCamera ? '正在打开…' : '重新打开摄像头'}
              </button>
            )}
          </div>
        )}
        {cameraActive && (
          <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium">
            {isLanPhotoRelay() && pushFps > 0 ? `上传 ${pushFps} FPS` : '实时传输中'}
          </span>
        )}
        {flash && (
          <div className="pointer-events-none absolute inset-0 z-10 animate-[flash_0.18s_ease-out] bg-white opacity-90" />
        )}
      </div>

      <div className="shrink-0 space-y-3 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={!cameraActive || shooting || !certNo}
          onClick={() => void onShoot()}
          className="w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-3.5 text-base font-semibold disabled:opacity-50"
        >
          {shooting ? '处理中…' : certNo ? '拍一张' : '请先填编号'}
        </button>
        {status && cameraActive && (
          <p className="text-center text-xs text-slate-400">{status}</p>
        )}
      </div>

      <style>{`
        @keyframes flash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
