import React, { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'
import { LicenseBlocked } from '@/components/LicenseBlocked'
import { useAuth } from '@/context/AuthContext'

export const LoginPage: React.FC = () => {
  const { authed, login, license, licenseLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/inventory'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (licenseLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-warm)] text-sm text-slate-500">
        正在验证许可…
      </div>
    )
  }

  if (!license.allowed) {
    return <LicenseBlocked message={license.message} />
  }

  if (authed) {
    return <Navigate to={from.startsWith('/login') ? '/inventory' : from} replace />
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = username.trim()
    if (!user || !password) {
      setError('请输入账号和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(user, password)
      navigate(from.startsWith('/login') ? '/inventory' : from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-warm)] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">统一经营台</h1>
            <p className="text-xs text-slate-400">和田玉统一经营系统</p>
            <p className="text-sm text-slate-500">请登录后继续使用</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm text-slate-600">账号</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-300"
              autoComplete="username"
              value={username}
              disabled={loading}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-slate-600">密码</span>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-300"
              autoComplete="current-password"
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
