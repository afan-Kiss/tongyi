import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { authApi } from '@/api/endpoints'

import { defaultLicenseInfo, type LicenseInfo } from '@/lib/license'



type AuthState = {

  loading: boolean

  authed: boolean

  username: string

  displayName: string

  license: LicenseInfo

  licenseLoading: boolean

  refresh: () => Promise<void>

  refreshLicense: () => Promise<void>

  login: (username: string, password: string) => Promise<void>

  logout: () => Promise<void>

}



const AuthContext = createContext<AuthState | null>(null)



function parseLicense(data: Partial<LicenseInfo> | undefined): LicenseInfo {

  if (!data) return defaultLicenseInfo()

  return {

    allowed: data.allowed !== false,

    message: String(data.message || ''),

    switchValue: data.switchValue ?? null,

  }

}



function applyAuthStatus(

  r: Awaited<ReturnType<typeof authApi.status>>,

  setAuthed: (v: boolean) => void,

  setUsername: (v: string) => void,

  setDisplayName: (v: string) => void,

  setLicense: (v: LicenseInfo) => void,

) {

  setAuthed(Boolean(r.data.authed))

  setUsername(String(r.data.username || ''))

  setDisplayName(String(r.data.displayName || '').trim())

  if (r.data.license) setLicense(parseLicense(r.data.license))

}



export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const [loading, setLoading] = useState(true)

  const [licenseLoading, setLicenseLoading] = useState(true)

  const [authed, setAuthed] = useState(false)

  const [username, setUsername] = useState('')

  const [displayName, setDisplayName] = useState('')

  const [license, setLicense] = useState<LicenseInfo>(defaultLicenseInfo)



  const refreshLicense = useCallback(async () => {

    setLicenseLoading(true)

    try {

      const r = await authApi.license()

      setLicense(parseLicense(r.data))

    } catch {

      setLicense(defaultLicenseInfo())

    } finally {

      setLicenseLoading(false)

    }

  }, [])



  const refresh = useCallback(async () => {

    try {

      applyAuthStatus(await authApi.status(), setAuthed, setUsername, setDisplayName, setLicense)

    } catch (e) {

      const msg = e instanceof Error ? e.message : ''

      if (msg.includes('请先登录')) {

        setAuthed(false)

        setUsername('')

        setDisplayName('')

      } else {

        try {

          await new Promise((r) => setTimeout(r, 600))

          applyAuthStatus(await authApi.status(), setAuthed, setUsername, setDisplayName, setLicense)

        } catch (e2) {

          const msg2 = e2 instanceof Error ? e2.message : ''

          if (msg2.includes('请先登录')) {

            setAuthed(false)

            setUsername('')

            setDisplayName('')

          }

        }

      }

    } finally {

      setLoading(false)

    }

  }, [])



  const authCheckTimer = useRef<number | null>(null)



  const verifySession = useCallback(async () => {

    try {

      applyAuthStatus(await authApi.status(), setAuthed, setUsername, setDisplayName, setLicense)

    } catch {

      // 网络抖动或服务重启中：保留当前登录态，避免误踢

    }

  }, [])



  useEffect(() => {

    void refreshLicense()

    void refresh()

    const onAuthCheck = () => {

      if (authCheckTimer.current) window.clearTimeout(authCheckTimer.current)

      authCheckTimer.current = window.setTimeout(() => {

        authCheckTimer.current = null

        void verifySession()

      }, 400)

    }

    const onLicenseBlocked = (ev: Event) => {

      const detail = (ev as CustomEvent<LicenseInfo>).detail

      if (detail) setLicense(parseLicense(detail))

      else void refreshLicense()

    }

    const onProfileUpdated = (ev: Event) => {

      const detail = (ev as CustomEvent<{ displayName?: string }>).detail

      if (detail?.displayName !== undefined) {

        setDisplayName(String(detail.displayName || '').trim())

      } else {

        void verifySession()

      }

    }

    window.addEventListener('auth:check', onAuthCheck)

    window.addEventListener('license:blocked', onLicenseBlocked)

    window.addEventListener('user-profile:updated', onProfileUpdated)

    return () => {

      if (authCheckTimer.current) window.clearTimeout(authCheckTimer.current)

      window.removeEventListener('auth:check', onAuthCheck)

      window.removeEventListener('license:blocked', onLicenseBlocked)

      window.removeEventListener('user-profile:updated', onProfileUpdated)

    }

  }, [refresh, refreshLicense, verifySession])



  const login = useCallback(async (user: string, password: string) => {

    const r = await authApi.login(user, password)

    setAuthed(true)

    setUsername(String(r.data.username || user))

    try {

      const profile = await authApi.profile()

      setDisplayName(String(profile.data.displayName || '').trim())

    } catch {

      setDisplayName('')

    }

  }, [])



  const logout = useCallback(async () => {

    try {

      await authApi.logout()

    } finally {

      setAuthed(false)

      setUsername('')

      setDisplayName('')

    }

  }, [])



  const value = useMemo(

    () => ({

      loading,

      authed,

      username,

      displayName,

      license,

      licenseLoading,

      refresh,

      refreshLicense,

      login,

      logout,

    }),

    [loading, authed, username, displayName, license, licenseLoading, refresh, refreshLicense, login, logout],

  )



  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

}



export function useAuth(): AuthState {

  const ctx = useContext(AuthContext)

  if (!ctx) throw new Error('useAuth must be used within AuthProvider')

  return ctx

}


