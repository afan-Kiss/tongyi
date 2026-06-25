import fs from 'node:fs'
import path from 'node:path'
import session from 'express-session'
import { getDataDir } from '../config/env'

interface StoredSession {
  sess: session.SessionData
  expires?: number
}

/** 文件 Session 存储 — 重启服务后登录态不丢失（替代 MemoryStore） */
export class FileSessionStore extends session.Store {
  private dir: string

  constructor(dir = path.join(getDataDir(), 'sessions')) {
    super()
    this.dir = dir
    fs.mkdirSync(dir, { recursive: true })
  }

  private file(sid: string): string {
    const safe = sid.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.dir, `${safe}.json`)
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    this.readSession(sid, 3, callback)
  }

  private readSession(
    sid: string,
    attemptsLeft: number,
    callback: (err: unknown, session?: session.SessionData | null) => void,
  ): void {
    const f = this.file(sid)
    fs.readFile(f, 'utf8', (err, raw) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return callback(null, null)
        if (attemptsLeft > 1) {
          setTimeout(() => this.readSession(sid, attemptsLeft - 1, callback), 60)
          return
        }
        return callback(err)
      }
      try {
        const data = JSON.parse(raw) as StoredSession
        if (data.expires && data.expires <= Date.now()) {
          fs.unlink(f, () => {})
          return callback(null, null)
        }
        callback(null, data.sess)
      } catch (parseErr) {
        callback(parseErr)
      }
    })
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    const maxAge = sess.cookie?.maxAge ?? 30 * 24 * 60 * 60 * 1000
    const expires = Date.now() + maxAge
    const payload = JSON.stringify({ sess, expires } satisfies StoredSession)
    fs.writeFile(this.file(sid), payload, (err) => callback?.(err))
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    fs.unlink(this.file(sid), () => callback?.(null))
  }

  touch(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    this.set(sid, sess, callback)
  }
}
