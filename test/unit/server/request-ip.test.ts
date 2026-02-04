import { describe, it, expect } from 'vitest'
import {
  normalizeIp,
  createRequesterIdentity,
  parseTrustProxyEnv,
} from '../../../server/request-ip.js'

describe('request-ip helpers', () => {
  describe('normalizeIp', () => {
    it('normalizes IPv4-mapped IPv6 addresses', () => {
      expect(normalizeIp('::ffff:192.168.0.5')).toBe('192.168.0.5')
    })

    it('strips IPv6 zone identifiers', () => {
      expect(normalizeIp('fe80::1%lo0')).toBe('fe80::1')
    })

    it('strips IPv6 brackets', () => {
      expect(normalizeIp('[::1]')).toBe('::1')
    })

    it('returns null for invalid IPs', () => {
      expect(normalizeIp('not-an-ip')).toBeNull()
    })
  })

  describe('createRequesterIdentity', () => {
    it('includes both loopback forms when requester is loopback', () => {
      const requester = createRequesterIdentity('127.0.0.1')
      expect(requester.allowedIps).toContain('127.0.0.1')
      expect(requester.allowedIps).toContain('::1')
      expect(requester.key).toBe('loopback')
    })
  })

  describe('parseTrustProxyEnv', () => {
    it('defaults to loopback when unset', () => {
      expect(parseTrustProxyEnv(undefined)).toBe('loopback')
      expect(parseTrustProxyEnv('')).toBe('loopback')
    })

    it('parses truthy and falsy values', () => {
      expect(parseTrustProxyEnv('true')).toBe(true)
      expect(parseTrustProxyEnv('false')).toBe(false)
      expect(parseTrustProxyEnv('0')).toBe(false)
    })

    it('parses numeric hop counts', () => {
      expect(parseTrustProxyEnv('1')).toBe(1)
      expect(parseTrustProxyEnv('2')).toBe(2)
    })

    it('passes through custom values', () => {
      expect(parseTrustProxyEnv('10.0.0.0/8')).toBe('10.0.0.0/8')
    })
  })
})
