import { describe, it, expect } from 'vitest'
import { isLoopbackHostname } from '@/lib/url-rewrite'

describe('isLoopbackHostname', () => {
  it('returns true for localhost', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
  })

  it('returns true for 127.0.0.1', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
  })

  it('returns true for ::1', () => {
    expect(isLoopbackHostname('::1')).toBe(true)
  })

  it('returns true for [::1] (bracketed IPv6)', () => {
    expect(isLoopbackHostname('[::1]')).toBe(true)
  })

  it('returns false for a LAN IP', () => {
    expect(isLoopbackHostname('192.168.1.100')).toBe(false)
  })

  it('returns false for a domain name', () => {
    expect(isLoopbackHostname('example.com')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isLoopbackHostname('')).toBe(false)
  })
})
