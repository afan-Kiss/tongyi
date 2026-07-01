import fs from 'node:fs'
import path from 'node:path'
import { MONOREPO_ROOT } from '../config/env'

export interface LegacySqliteOptions {
  dbPath?: string
  readonly?: boolean
}

export function resolveLegacyAccountingDbPath(custom?: string): string {
  if (custom?.trim()) return path.resolve(custom.trim())
  const candidates = [
    path.join(MONOREPO_ROOT, '..', '记账系统', 'apps', 'server', 'data', 'accounting.db'),
    path.join(MONOREPO_ROOT, '..', '记账系统', 'apps', 'server', 'prisma', 'data', 'accounting.db'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

export function resolveLegacyLiveAnalysisDbPath(custom?: string): string {
  if (custom?.trim()) return path.resolve(custom.trim())
  const candidates = [
    path.join(MONOREPO_ROOT, '..', '主播分析软件', 'apps', 'server', 'data', 'app.db'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

export function openLegacyDatabase(dbPath: string, readonly = true) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`找不到旧数据库文件：${dbPath}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  return new Database(dbPath, { readonly, fileMustExist: true })
}

import type Database from 'better-sqlite3'

export function tableExists(db: Database.Database, name: string) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name) as
    | { name: string }
    | undefined
  return Boolean(row?.name)
}
