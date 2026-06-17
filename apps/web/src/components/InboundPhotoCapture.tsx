import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Camera, ImagePlus, Smartphone, X } from 'lucide-react'
import { api } from '@/lib/api'
import { buildMobileCameraUrl, isSecureLanMobileCameraUrl } from '@/lib/photoRelayUrl'
import { clearPhotoRelayStationId, loadPhotoRelayStationId, savePhotoRelayStationId } from '@/lib/photoRelayStation'
import {
  attachStreamToVideo,
  canUseLiveCamera,
  captureVideoFrame,
  dataUrlToFile,
  isMobileDevice,
  liveCameraBlockedReason,
  normalizePhotoDataUrl,
} from '@/lib/media'

interface Props {
  certNo: string
  disabled?: boolean
  /** 登记前拍照：先本地缓存，登记成功后再上传 */
  deferUpload?: boolean
  /** 库存编辑：同步时确认 relay 缓冲，避免重开编辑重复拉取旧照片 */
  ackRelayPhotos?: boolean
  onUploaded?: () => void | Promise<void>
}

export interface InboundPhotoCaptureHandle {
  pendingCount: () => number
  flushPending: (certNo: string) => Promise<void>
}

type PendingPhoto = { dataUrl: string; name: string }

export const InboundPhotoCapture = forwardRef<InboundPhotoCaptureHandle, Props>(function InboundPhotoCapture(
  { certNo, disabled, deferUpload = false, ackRelayPhotos = false, onUploaded },
  ref,
) {
  const useRelayMode = !isMobileDevice()

  const [status, setStatus] = useState('')
  const [uploading, setUploading] = useState(false)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [photoCameraActive, setPhotoCameraActive] = useState(false)
  const [flash, setFlash] = useState(false)

  const [sessionId, setSessionId] = useState('')
  const [relayFrame, setRelayFrame] = useState<string | null>(null)
  const [phoneOnline, setPhoneOnline] = useState(false)
  const [mobileUrl, setMobileUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [relayCertReady, setRelayCertReady] = useState(false)

  const pendingRef = useRef<PendingPhoto[]>([])
  const prevCodeRef = useRef('')
  const lastPhotoSeqRef = useRef(0)
  const lastFrameAtRef = useRef(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const code = certNo.trim().toUpperCase()
  const relaySeqKey = (sid: string, cert: string) => `jade-relay-seq:${sid}:${cert}`
  const cameraBlockedHint = liveCameraBlockedReason()
  const liveCameraOk = canUseLiveCamera()

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const setPhotoCameraUi = useCallback((active: boolean) => {
    setPhotoCameraActive(active)
  }, [])

  const startPhotoCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhotoCameraUi(false)
      return false
    }
    stopStream()
    const video = videoRef.current
    if (!video) return false
    setPhotoCameraUi(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      await attachStreamToVideo(video, stream, 8000)
      return true
    } catch {
      stopStream()
      setPhotoCameraUi(false)
      return false
    }
  }, [setPhotoCameraUi, stopStream])

  const removePendingPhoto = useCallback((index: number) => {
    pendingRef.current = pendingRef.current.filter((_, i) => i !== index)
    setThumbs((prev) => prev.filter((_, i) => i !== index))
    setStatus(
      pendingRef.current.length
        ? deferUpload
          ? `已拍摄 ${pendingRef.current.length} 张（登记后自动上传）`
          : `已选 ${pendingRef.current.length} 张（保存时上传）`
        : '已清空待上传照片',
    )
  }, [deferUpload])

  const addPendingPhoto = useCallback(
    async (dataUrl: string, name: string, flashOn = true) => {
      const normalized = await normalizePhotoDataUrl(dataUrl)
      pendingRef.current.push({ dataUrl: normalized, name })
      setThumbs((prev) => [...prev, normalized])
      if (flashOn) {
        setFlash(true)
        window.setTimeout(() => setFlash(false), 180)
      }
      setStatus(
        deferUpload
          ? `已拍摄 ${pendingRef.current.length} 张（登记后自动上传）`
          : `已收到 ${pendingRef.current.length} 张（保存时上传）`,
      )
    },
    [deferUpload],
  )

  const uploadRelayPhoto = useCallback(
    async (dataUrl: string, name: string) => {
      if (!code || disabled) return
      setUploading(true)
      try {
        const normalized = await normalizePhotoDataUrl(dataUrl)
        const file = dataUrlToFile(normalized, name)
        await api.uploadMedia(code, file)
        setStatus(`已上传 ${name}`)
        await onUploaded?.()
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading(false)
      }
    },
    [code, disabled, onUploaded],
  )

  const initStationQr = useCallback(async (sid: string) => {
    const [settings, sysStatus] = await Promise.all([api.getSettings(), api.getStatus()])
    const url = buildMobileCameraUrl(sid, settings.data, sysStatus.data)
    setMobileUrl(url)
    setQrDataUrl(await QRCode.toDataURL(url, { width: 180, margin: 1 }))
  }, [])

  const resetStation = useCallback(async () => {
    clearPhotoRelayStationId()
    setSessionId('')
    setQrDataUrl('')
    setPhoneOnline(false)
    const relay = await api.getPhotoRelayStation()
    savePhotoRelayStationId(relay.data.sessionId)
    setSessionId(relay.data.sessionId)
    await initStationQr(relay.data.sessionId)
    setStatus('已生成新二维码，请用手机重新扫码')
  }, [initStationQr])

  useEffect(() => {
    if (!useRelayMode || disabled) return
    let cancelled = false
    ;(async () => {
      try {
        const stored = loadPhotoRelayStationId()
        const relay = await api.getPhotoRelayStation(stored || undefined)
        if (cancelled) return
        savePhotoRelayStationId(relay.data.sessionId)
        setSessionId(relay.data.sessionId)
        await initStationQr(relay.data.sessionId)
        setStatus('首次用手机扫码连接，之后换编号无需再扫')
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [disabled, useRelayMode, initStationQr])

  useEffect(() => {
    if (!useRelayMode || !sessionId || !code || disabled) {
      setRelayCertReady(false)
      return
    }

    let cancelled = false
    setRelayCertReady(false)
    if (sessionId && code) {
      const storedSeq = sessionStorage.getItem(relaySeqKey(sessionId, code))
      if (storedSeq) {
        lastPhotoSeqRef.current = Math.max(lastPhotoSeqRef.current, Number(storedSeq) || 0)
      }
    }
    if (ackRelayPhotos) {
      pendingRef.current = []
      setThumbs([])
    }
    ;(async () => {
      try {
        const r = await api.syncPhotoRelayCert(sessionId, code, ackRelayPhotos)
        if (cancelled) return
        if (r.data.changed) {
          pendingRef.current = []
          setThumbs([])
          lastPhotoSeqRef.current = 0
          if (prevCodeRef.current) {
            setStatus(`已切换至 ${code}，请重新拍摄`)
          }
        } else {
          lastPhotoSeqRef.current = r.data.photoSeq ?? lastPhotoSeqRef.current
          if (ackRelayPhotos) {
            pendingRef.current = []
            setThumbs([])
          }
        }
        sessionStorage.setItem(relaySeqKey(sessionId, code), String(lastPhotoSeqRef.current))
        prevCodeRef.current = code
        setRelayCertReady(true)
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, sessionId, disabled, useRelayMode, ackRelayPhotos])

  useEffect(() => {
    if (!useRelayMode || !sessionId || disabled || !relayCertReady) return
    let cancelled = false
    const poll = async () => {
      try {
        const r = await api.pollPhotoRelay(sessionId, lastPhotoSeqRef.current)
        if (cancelled) return
        if (r.data.frameAt > lastFrameAtRef.current && r.data.frame) {
          lastFrameAtRef.current = r.data.frameAt
          setRelayFrame(r.data.frame)
        }
        setPhoneOnline(r.data.phoneOnline)
        if (r.data.photos.length) {
          for (const photo of r.data.photos) {
            lastPhotoSeqRef.current = photo.seq
            sessionStorage.setItem(relaySeqKey(sessionId, code), String(photo.seq))
            const name = `${code}-photo-${photo.seq}.jpg`
            if (deferUpload) {
              await addPendingPhoto(photo.dataUrl, name)
            } else {
              await uploadRelayPhoto(photo.dataUrl, name)
            }
          }
        } else if (r.data.photoSeq != null) {
          lastPhotoSeqRef.current = Math.max(lastPhotoSeqRef.current, r.data.photoSeq)
          sessionStorage.setItem(relaySeqKey(sessionId, code), String(lastPhotoSeqRef.current))
        }
      } catch {
        /* 忽略单次轮询失败 */
      }
    }
    void poll()
    const timer = window.setInterval(poll, 300)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [sessionId, disabled, useRelayMode, code, deferUpload, relayCertReady, addPendingPhoto, uploadRelayPhoto])

  useEffect(() => {
    if (useRelayMode || !code || disabled) return
    if (prevCodeRef.current && prevCodeRef.current !== code && pendingRef.current.length > 0) {
      pendingRef.current = []
      setThumbs([])
      setStatus('编号已变更，已清空待上传照片，请重新拍摄')
    }
    prevCodeRef.current = code
    startPhotoCamera()
    return () => stopStream()
  }, [code, disabled, startPhotoCamera, stopStream, useRelayMode])

  const flashCapture = () => {
    setFlash(true)
    window.setTimeout(() => setFlash(false), 180)
    if (navigator.vibrate) navigator.vibrate(20)
  }

  const captureFrameFromPreview = (): string | null => {
    const video = videoRef.current
    if (!video) return null
    return captureVideoFrame(video)
  }

  const uploadFile = async (file: File, targetCert?: string) => {
    const uploadCode = (targetCert || code).trim().toUpperCase()
    if (!uploadCode || disabled) {
      setStatus(deferUpload ? '请先填写编号' : '请先完成入库')
      return
    }
    if (deferUpload && !targetCert) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      pendingRef.current.push({ dataUrl, name: file.name })
      setThumbs((prev) => [...prev, dataUrl])
      setStatus(`已拍摄 ${pendingRef.current.length} 张（登记后自动上传）`)
      return
    }
    setUploading(true)
    setStatus('上传中…')
    try {
      await api.uploadMedia(uploadCode, file)
      setStatus(`已上传 ${file.name}`)
      await onUploaded?.()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  const uploadDataUrl = async (dataUrl: string, index: number, targetCert?: string) => {
    try {
      const normalized = await normalizePhotoDataUrl(dataUrl)
      setThumbs((prev) => {
        const next = [...prev]
        next[index] = normalized
        return next
      })
      const file = dataUrlToFile(normalized, `${code || 'photo'}-${Date.now()}.jpg`)
      await uploadFile(file, targetCert)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const shootFromPreview = async () => {
    const dataUrl = captureFrameFromPreview()
    if (!dataUrl) return false
    flashCapture()
    const index = thumbs.length
    setThumbs((prev) => [...prev, dataUrl])
    if (deferUpload) {
      pendingRef.current.push({ dataUrl, name: `${code}-photo-${Date.now()}.jpg` })
      setStatus(`已拍摄 ${pendingRef.current.length} 张（登记后自动上传）`)
      return true
    }
    await uploadDataUrl(dataUrl, index)
    return true
  }

  const onShoot = async () => {
    if (!code || disabled) {
      setStatus('请先填写编号')
      return
    }
    if (photoCameraActive && (await shootFromPreview())) return
    if (!photoCameraActive) {
      const ok = await startPhotoCamera()
      if (ok && (await shootFromPreview())) return
      setStatus(cameraBlockedHint || '摄像头未就绪，请从相册选图')
    }
  }

  const onAlbumPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const index = thumbs.length
        setThumbs((prev) => [...prev, dataUrl])
        if (deferUpload) {
          pendingRef.current.push({ dataUrl, name: file.name })
          setStatus(`已选 ${pendingRef.current.length} 张（登记后自动上传）`)
        } else {
          await uploadDataUrl(dataUrl, index)
        }
      } else {
        await uploadFile(file)
      }
    }
  }

  useImperativeHandle(ref, () => ({
    pendingCount: () => pendingRef.current.length,
    flushPending: async (targetCert: string) => {
      const uploadCode = targetCert.trim().toUpperCase()
      if (!uploadCode || !pendingRef.current.length) return
      setUploading(true)
      setStatus('正在上传照片…')
      try {
        for (const item of pendingRef.current) {
          const normalized = await normalizePhotoDataUrl(item.dataUrl)
          const file = dataUrlToFile(normalized, item.name)
          await api.uploadMedia(uploadCode, file)
        }
        const n = pendingRef.current.length
        pendingRef.current = []
        setStatus(`已上传 ${n} 张照片`)
        await onUploaded?.()
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        setStatus(errMsg)
        throw e
      } finally {
        setUploading(false)
      }
    },
  }))

  if (!code && !useRelayMode) {
    return (
      <p className="text-[11px] text-slate-400">填写编号后可实时拍照（登记前可连拍，登记后自动上传）</p>
    )
  }

  if (useRelayMode) {
    return (
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="relative aspect-[3/4] min-w-0 flex-1 overflow-hidden rounded-2xl bg-slate-900 shadow-sm">
            {relayFrame ? (
              <img src={relayFrame} alt="手机实时画面" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 px-4 text-center text-slate-300">
                <Smartphone size={40} className="mb-3 opacity-80" />
                <p className="max-w-[240px] text-sm leading-relaxed">
                  {phoneOnline ? '等待手机画面…' : '请用手机扫描二维码（只需扫一次）'}
                </p>
              </div>
            )}
            <span
              className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium text-white ${
                phoneOnline ? 'bg-emerald-600/80' : 'bg-black/50'
              }`}
            >
              {phoneOnline ? '手机已连接' : '等待手机'}
            </span>
            {code && (
              <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white">
                {code}
              </span>
            )}
            {flash && (
              <div className="pointer-events-none absolute inset-0 z-10 animate-[flash_0.18s_ease-out] bg-white opacity-90" />
            )}
          </div>

          <div className="flex w-[140px] shrink-0 flex-col items-center rounded-2xl border border-violet-100 bg-white p-3">
            {phoneOnline ? (
              <>
                <p className="text-center text-[10px] font-medium text-emerald-700">手机已连接</p>
                <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-500">
                  换编号自动同步，无需再扫码
                </p>
                <button
                  type="button"
                  onClick={() => void resetStation()}
                  className="mt-3 text-[10px] text-slate-400 underline"
                >
                  换手机扫码
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-[10px] font-medium text-slate-600">手机扫码（HTTPS · 一次）</p>
                {isSecureLanMobileCameraUrl(mobileUrl) && (
                  <p className="mt-1 text-center text-[9px] leading-relaxed text-emerald-600">
                    内网 HTTPS · 同 WiFi 最快
                    <br />
                    首次打开点「高级」→「继续访问」
                  </p>
                )}
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="手机拍照二维码" className="mt-2 rounded-lg border border-slate-100" />
                ) : (
                  <div className="mt-2 flex h-[140px] w-[140px] items-center justify-center rounded-lg bg-slate-50 text-[10px] text-slate-400">
                    生成中…
                  </div>
                )}
                {mobileUrl && (
                  <p className="mt-2 break-all text-center text-[9px] leading-tight text-slate-400">{mobileUrl}</p>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          {code
            ? '电脑填编号、手机连拍；登记下一条时只改编号，不用重新扫码'
            : '可先扫码连接手机，再填写编号拍照'}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => albumRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white py-2.5 text-sm text-slate-700 disabled:opacity-50"
          >
            <ImagePlus size={16} />
            从电脑选图
          </button>
        </div>

        <input
          ref={albumRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onAlbumPick}
        />

        {thumbs.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {thumbs.map((src, idx) => (
              <div key={`${idx}-${src.slice(0, 24)}`} className="relative aspect-square overflow-hidden rounded-xl border border-rose-100">
                <img src={src} alt={`photo-${idx}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  disabled={disabled || uploading}
                  onClick={() => removePendingPhoto(idx)}
                  className="absolute right-1 top-1 rounded-full bg-red-500/90 p-1 text-white disabled:opacity-50"
                  aria-label="删除照片"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {status && <p className="text-center text-xs text-slate-600">{status}</p>}

        <style>{`
          @keyframes flash {
            0% { opacity: 0.9; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {cameraBlockedHint && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          {cameraBlockedHint}
        </p>
      )}

      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-900 shadow-sm">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${photoCameraActive ? 'block' : 'hidden'}`}
        />
        {!photoCameraActive && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 px-4 text-center text-slate-300">
            <Camera size={40} className="mb-3 opacity-80" />
            <p className="max-w-[280px] text-sm leading-relaxed">
              {cameraBlockedHint || (liveCameraOk ? '正在打开摄像头…' : '点击「拍一张」尝试打开摄像头，或用相册选图')}
            </p>
          </div>
        )}
        {photoCameraActive && (
          <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white">
            连拍
          </span>
        )}
        {flash && (
          <div className="pointer-events-none absolute inset-0 z-10 animate-[flash_0.18s_ease-out] bg-white opacity-90" />
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400">
        {deferUpload
          ? '登记前可连拍，确认登记后自动上传到系统（不进 Excel、不打印）'
          : photoCameraActive
            ? '预览中连点「拍一张」可连续拍摄并自动上传'
            : '外网请用 HTTPS 地址（设置页）扫码，才能手机实时连拍'}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={onShoot}
          className="flex-1 rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          拍一张
        </button>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => albumRef.current?.click()}
          className="flex items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
        >
          <ImagePlus size={16} />
          相册
        </button>
      </div>

      <input
        ref={albumRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onAlbumPick}
      />

      {thumbs.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {thumbs.map((src, idx) => (
            <div key={`${idx}-${src.slice(0, 24)}`} className="relative aspect-square overflow-hidden rounded-xl border border-rose-100">
              <img src={src} alt={`photo-${idx}`} className="h-full w-full object-cover" />
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => removePendingPhoto(idx)}
                className="absolute right-1 top-1 rounded-full bg-red-500/90 p-1 text-white disabled:opacity-50"
                aria-label="删除照片"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {status && <p className="text-center text-xs text-slate-600">{status}</p>}

      <style>{`
        @keyframes flash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
})
