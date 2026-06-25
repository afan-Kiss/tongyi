import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { getDataDir, SERVER_ROOT } from '../config/env'

export interface AuthUserRecord {
  username: string
  passwordHash?: string
  password?: string
  disabled?: boolean
  /** 该登录账号的显示用户名（与 username 无关，各账号独立） */
  displayName?: string
}

interface AuthUsersFile {
  users: AuthUserRecord[]
}

const AUTH_FILE = () => path.join(getDataDir(), 'auth-users.json')
const AUTH_BACKUP_FILE = () => path.join(getDataDir(), 'auth-users.json.bak')
const EXAMPLE_FILE = path.join(SERVER_ROOT, 'auth-users.example.json')

function backupAuthFileIfExists(): void {
  const file = AUTH_FILE()
  if (!fs.existsSync(file)) return
  try {
    fs.copyFileSync(file, AUTH_BACKUP_FILE())
  } catch {
    // 备份失败不阻断写入
  }
}

function readAuthFile(): AuthUsersFile {
  ensureAuthUsersFile()
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE(), 'utf8')) as AuthUsersFile
    if (!Array.isArray(raw.users)) return { users: [] }
    return raw
  } catch {
    return { users: [] }
  }
}

function writeAuthFile(data: AuthUsersFile): void {
  backupAuthFileIfExists()
  const normalized: AuthUsersFile = {
    users: data.users.map((u) => {
      const row: AuthUserRecord = {
        username: String(u.username || '').trim(),
        passwordHash: String(u.passwordHash || '').trim(),
        disabled: u.disabled === true,
      }
      const displayName = String(u.displayName || '').trim()
      if (displayName) row.displayName = displayName
      return row
    }),
  }
  fs.writeFileSync(AUTH_FILE(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
}

/** 首次启动时从备份/示例恢复；明文 password 会自动哈希并写回（仅本地 data 目录） */
export function ensureAuthUsersFile(): void {
  const file = AUTH_FILE()
  const backup = AUTH_BACKUP_FILE()
  if (!fs.existsSync(file)) {
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, file)
      console.log('[auth] auth-users.json 缺失，已从 auth-users.json.bak 恢复')
    } else if (fs.existsSync(EXAMPLE_FILE)) {
      fs.copyFileSync(EXAMPLE_FILE, file)
      console.log('[auth] auth-users.json 缺失，已从示例文件初始化')
    } else {
      writeAuthFile({ users: [] })
      return
    }
  } else {
    backupAuthFileIfExists()
  }

  const data = readAuthFileRaw()
  let changed = false
  for (const user of data.users) {
    const plain = String(user.password || '').trim()
    if (!plain) continue
    user.passwordHash = bcrypt.hashSync(plain, 10)
    delete user.password
    changed = true
  }
  if (changed) writeAuthFile(data)
}

function readAuthFileRaw(): AuthUsersFile {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE(), 'utf8')) as AuthUsersFile
  } catch {
    return { users: [] }
  }
}

export function listAuthUsernames(): string[] {
  ensureAuthUsersFile()
  return readAuthFile()
    .users.filter((u) => u.username && u.passwordHash && u.disabled !== true)
    .map((u) => u.username)
}

export function verifyLogin(username: string, password: string): { ok: true; username: string } | { ok: false } {
  ensureAuthUsersFile()
  const name = String(username || '').trim()
  const pwd = String(password || '')
  if (!name || !pwd) return { ok: false }

  const user = readAuthFile().users.find(
    (u) => u.disabled !== true && u.username.toLowerCase() === name.toLowerCase(),
  )
  if (!user?.passwordHash) return { ok: false }
  if (!bcrypt.compareSync(pwd, user.passwordHash)) return { ok: false }
  return { ok: true, username: user.username }
}

function findAuthUser(loginUsername: string): AuthUserRecord | undefined {
  const name = String(loginUsername || '').trim()
  if (!name) return undefined
  return readAuthFile().users.find(
    (u) => u.disabled !== true && u.username.toLowerCase() === name.toLowerCase(),
  )
}

export function getUserDisplayName(loginUsername: string): string {
  return String(findAuthUser(loginUsername)?.displayName || '').trim()
}

export function getUserProfile(loginUsername: string): { username: string; displayName: string } {
  const user = findAuthUser(loginUsername)
  return {
    username: user?.username || String(loginUsername || '').trim(),
    displayName: String(user?.displayName || '').trim(),
  }
}

export function setUserDisplayName(
  loginUsername: string,
  displayName: string,
): { username: string; displayName: string } {
  const name = String(loginUsername || '').trim()
  if (!name) throw new Error('未登录')
  const data = readAuthFileRaw()
  const user = data.users.find(
    (u) => u.disabled !== true && u.username.toLowerCase() === name.toLowerCase(),
  )
  if (!user) throw new Error('用户不存在')
  const trimmed = String(displayName || '').trim()
  if (trimmed) user.displayName = trimmed
  else delete user.displayName
  writeAuthFile(data)
  return { username: user.username, displayName: trimmed }
}

export function getSessionSecret(): string {
  const fromEnv = String(process.env.SESSION_SECRET || '').trim()
  if (fromEnv) return fromEnv
  const secretFile = path.join(getDataDir(), 'session.secret')
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim()
  }
  const secret = bcrypt.hashSync(`${Date.now()}-${Math.random()}`, 10)
  fs.writeFileSync(secretFile, secret, 'utf8')
  return secret
}
