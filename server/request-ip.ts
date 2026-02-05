import type { Request } from 'express'
import * as net from 'net'

export interface RequesterIdentity {
  ip: string
  key: string
  allowedIps: string[]
}

const LOOPBACK_IPV4 = '127.0.0.1'
const LOOPBACK_IPV6 = '::1'

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null
  let ip = value.trim()
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1)
  }
  const zoneIndex = ip.indexOf('%')
  if (zoneIndex !== -1) {
    ip = ip.slice(0, zoneIndex)
  }
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const maybeIpv4 = ip.slice(7)
    if (net.isIP(maybeIpv4) === 4) {
      return maybeIpv4
    }
  }
  return net.isIP(ip) ? ip : null
}

export function createRequesterIdentity(rawIp: string): RequesterIdentity {
  const normalized = normalizeIp(rawIp)
  if (!normalized) {
    throw new Error(`Invalid requester IP: ${rawIp}`)
  }

  const allowed = new Set<string>()
  allowed.add(normalized)

  if (normalized === LOOPBACK_IPV4) {
    allowed.add(LOOPBACK_IPV6)
  } else if (normalized === LOOPBACK_IPV6) {
    allowed.add(LOOPBACK_IPV4)
  }

  const key =
    normalized === LOOPBACK_IPV4 || normalized === LOOPBACK_IPV6
      ? 'loopback'
      : normalized

  return {
    ip: normalized,
    key,
    allowedIps: [...allowed],
  }
}

export function getRequesterIdentity(req: Request): RequesterIdentity {
  const rawIp = req.ip || req.socket?.remoteAddress
  if (!rawIp) {
    throw new Error('Unable to determine requester IP')
  }
  return createRequesterIdentity(rawIp)
}

export function parseTrustProxyEnv(
  value: string | undefined,
): string | number | boolean {
  if (!value || value.trim() === '') return 'loopback'
  const normalized = value.trim().toLowerCase()
  if (normalized === '0') return false
  if (/^\d+$/.test(normalized)) return Number(normalized)
  if (['true', 'yes', 'on', 'all'].includes(normalized)) return true
  if (['false', 'no', 'off'].includes(normalized)) return false
  return value.trim()
}
