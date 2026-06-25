import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'

import selfsigned from 'selfsigned'
import type { Application } from 'express'

import { getDataDir, getMobileHttpsPort } from '../config/env'
import { getLanIps } from '../services/settings.service'

function collectLanIps(): string[] {
  return getLanIps()
}

function certDir(): string {
  const dir = path.join(getDataDir(), 'mobile-https')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function needsRegenerate(dir: string, hosts: string[]): boolean {
  const keyPath = path.join(dir, 'key.pem')
  const metaPath = path.join(dir, 'meta.json')
  if (!fs.existsSync(keyPath)) return true
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { hosts?: string[] }
    const a = [...(meta.hosts || [])].sort().join(',')
    const b = [...hosts].sort().join(',')
    return a !== b
  } catch {
    return true
  }
}

export function ensureMobileHttpsCredentials(): { key: Buffer; cert: Buffer } {
  const dir = certDir()
  const hosts = [...new Set(['localhost', '127.0.0.1', ...collectLanIps()])]
  if (needsRegenerate(dir, hosts)) {
    const altNames: Array<{ type: 2; value: string } | { type: 7; ip: string }> = []
    for (const h of hosts) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) altNames.push({ type: 7, ip: h })
      else altNames.push({ type: 2, value: h })
    }
    const pems = selfsigned.generate([{ name: 'commonName', value: 'jade-inventory-mobile' }], {
      keySize: 2048,
      days: 825,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'subjectAltName', altNames },
      ],
    })
    fs.writeFileSync(path.join(dir, 'key.pem'), pems.private)
    fs.writeFileSync(path.join(dir, 'cert.pem'), pems.cert)
    fs.writeFileSync(
      path.join(dir, 'meta.json'),
      JSON.stringify({ hosts, generatedAt: new Date().toISOString() }),
    )
  }
  return {
    key: fs.readFileSync(path.join(dir, 'key.pem')),
    cert: fs.readFileSync(path.join(dir, 'cert.pem')),
  }
}

export function startMobileHttpsServer(app: Application): https.Server | null {
  const port = getMobileHttpsPort()
  if (!port) return null
  try {
    const { key, cert } = ensureMobileHttpsCredentials()
    const server = https.createServer({ key, cert }, app)
    server.listen(port, '0.0.0.0', () => {
      console.log(`[backend] https://0.0.0.0:${port} (手机拍照 HTTPS，首次扫码需在手机信任证书)`)
    })
    return server
  } catch (err) {
    console.error('[backend] 手机 HTTPS 启动失败:', err)
    return null
  }
}

export function isMobileHttpsEnabled(): boolean {
  return getMobileHttpsPort() > 0
}
