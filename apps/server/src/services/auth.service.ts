import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { getDataDir, SERVER_ROOT } from '../config/env'

export type AuthUserRole = 'admin' | 'user'

export interface AuthUserRecord {
  username: string
  passwordHash?: string
  password?: string
  disabled?: boolean
  role?: AuthUserRole
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
        role: u.role === 'admin' ? 'admin' : 'user',
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
  ensureDefaultAdminUser()
}

const DEFAULT_ADMIN_USERNAME = 'fanfan'
const DEFAULT_ADMIN_PASSWORD = 'fanfan9724'

/** 首次启动时确保 fanfan 管理员存在；已有 fanfan 账号则补全 admin 角色 */
function ensureDefaultAdminUser(): void {
  const data = readAuthFileRaw()
  const fanfan = data.users.find(
    (u) => u.username.toLowerCase() === DEFAULT_ADMIN_USERNAME.toLowerCase() && u.disabled !== true,
  )
  if (fanfan) {
    if (fanfan.role !== 'admin') {
      fanfan.role = 'admin'
      writeAuthFile(data)
    }
    return
  }
  data.users.push({
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash: bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10),
    role: 'admin',
    displayName: '管理员',
  })
  writeAuthFile(data)
  console.log(`[auth] 已创建默认管理员账号 ${DEFAULT_ADMIN_USERNAME}`)
}

export function upsertAdminUser(username: string, password: string, displayName?: string): AuthUserRecord {
  const name = String(username || '').trim()
  const pwd = String(password || '')
  if (!name || !pwd) throw new Error('用户名和密码不能为空')
  const data = readAuthFileRaw()
  let user = data.users.find((u) => u.username.toLowerCase() === name.toLowerCase())
  if (!user) {
    user = { username: name, role: 'admin' }
    data.users.push(user)
  }
  user.passwordHash = bcrypt.hashSync(pwd, 10)
  delete user.password
  user.role = 'admin'
  user.disabled = false
  if (displayName?.trim()) user.displayName = displayName.trim()
  writeAuthFile(data)
  return user
}

export function getUserRole(loginUsername: string): AuthUserRole {
  const user = findAuthUser(loginUsername)
  if (!user) return 'user'
  return user.role === 'admin' ? 'admin' : 'user'
}

export function isAdminUser(loginUsername?: string | null): boolean {
  return getUserRole(String(loginUsername || '')) === 'admin'
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

export function verifyLogin(
  username: string,
  password: string,
): { ok: true; username: string; role: AuthUserRole } | { ok: false } {
  ensureAuthUsersFile()
  const name = String(username || '').trim()
  const pwd = String(password || '')
  if (!name || !pwd) return { ok: false }

  const user = readAuthFile().users.find(
    (u) => u.disabled !== true && u.username.toLowerCase() === name.toLowerCase(),
  )
  if (!user?.passwordHash) return { ok: false }
  if (!bcrypt.compareSync(pwd, user.passwordHash)) return { ok: false }
  return { ok: true, username: user.username, role: user.role === 'admin' ? 'admin' : 'user' }
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

export function getUserProfile(loginUsername: string): { username: string; displayName: string; role: AuthUserRole } {
  const user = findAuthUser(loginUsername)
  return {
    username: user?.username || String(loginUsername || '').trim(),
    displayName: String(user?.displayName || '').trim(),
    role: user?.role === 'admin' ? 'admin' : 'user',
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
