#!/usr/bin/env node
/**
 * 创建或重置管理员账号（写入 apps/server/data/auth-users.json）
 * 用法：node scripts/setup-admin.js [用户名] [密码]
 * 默认：fanfan / fanfan9724
 */
const fs = require('node:fs')
const path = require('node:path')
const bcrypt = require('bcryptjs')

const DATA_DIR = path.join(__dirname, '..', 'apps', 'server', 'data')
const AUTH_FILE = path.join(DATA_DIR, 'auth-users.json')
const AUTH_BACKUP = path.join(DATA_DIR, 'auth-users.json.bak')
const EXAMPLE_FILE = path.join(__dirname, '..', 'apps', 'server', 'auth-users.example.json')

function readAuthFile() {
  if (!fs.existsSync(AUTH_FILE)) {
    if (fs.existsSync(AUTH_BACKUP)) fs.copyFileSync(AUTH_BACKUP, AUTH_FILE)
    else if (fs.existsSync(EXAMPLE_FILE)) fs.copyFileSync(EXAMPLE_FILE, AUTH_FILE)
    else fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    return Array.isArray(raw.users) ? raw : { users: [] }
  } catch {
    return { users: [] }
  }
}

function writeAuthFile(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  if (fs.existsSync(AUTH_FILE)) {
    try {
      fs.copyFileSync(AUTH_FILE, AUTH_BACKUP)
    } catch {
      // ignore
    }
  }
  const normalized = {
    users: data.users.map((u) => {
      const row = {
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
  fs.writeFileSync(AUTH_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
}

function upsertAdminUser(username, password, displayName) {
  const name = String(username || '').trim()
  const pwd = String(password || '')
  if (!name || !pwd) throw new Error('用户名和密码不能为空')
  const data = readAuthFile()
  let user = data.users.find((u) => String(u.username || '').toLowerCase() === name.toLowerCase())
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

function main() {
  const username = process.argv[2] || 'fanfan'
  const password = process.argv[3] || 'fanfan9724'
  const user = upsertAdminUser(username, password, '管理员')
  console.log(`[setup-admin] 管理员已就绪：${user.username}（role=admin）`)
}

main()
