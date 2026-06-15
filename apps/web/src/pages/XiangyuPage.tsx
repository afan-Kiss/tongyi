import React, { useCallback, useEffect, useState } from 'react'

import { RefreshCw } from 'lucide-react'

import { settingsApi } from '@/api/endpoints'



const PROXY_PATH = '/xiangyu-proxy/'



export const XiangyuPage: React.FC = () => {

  const [online, setOnline] = useState<boolean | null>(null)

  const [message, setMessage] = useState('')

  const [loading, setLoading] = useState(true)



  const loadStatus = useCallback(async () => {

    setLoading(true)

    try {

      const r = await settingsApi.status()

      setOnline(r.data.xiangyu?.online ?? false)

      setMessage(r.data.xiangyu?.message ?? '')

    } catch (e) {

      setOnline(false)

      setMessage(e instanceof Error ? e.message : '无法获取祥钰系统状态')

    } finally {

      setLoading(false)

    }

  }, [])



  useEffect(() => {

    loadStatus()

  }, [loadStatus])



  if (loading) {

    return <p className="p-6 text-center text-sm text-slate-500">正在连接祥钰系统…</p>

  }



  if (online === false) {

    return (

      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">

        <p className="text-sm text-slate-600">{message || '祥钰系统未启动'}</p>

        <p className="text-xs text-slate-400">

          请确认千帆 DevTools 已开启，后端会自动拉起祥钰 Web 与 Bridge

        </p>

        <button

          type="button"

          onClick={loadStatus}

          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm text-slate-700"

        >

          <RefreshCw size={14} />

          重试

        </button>

      </div>

    )

  }



  return (

    <iframe

      src={PROXY_PATH}

      title="祥钰珠宝 - 打包拍照发送"

      className="h-[calc(100dvh-5.25rem)] w-full border-0 bg-white"

      allow="camera; microphone"

    />

  )

}

