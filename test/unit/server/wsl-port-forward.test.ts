import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'

vi.mock('child_process')

import { getWslIp } from '../../../server/wsl-port-forward.js'

describe('wsl-port-forward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getWslIp', () => {
    it('returns first IPv4 address from hostname -I', () => {
      vi.mocked(execSync).mockReturnValue('172.30.149.249 172.17.0.1 \n')

      const ip = getWslIp()

      expect(ip).toBe('172.30.149.249')
    })

    it('skips IPv6 addresses and returns first IPv4', () => {
      vi.mocked(execSync).mockReturnValue('fe80::1 2001:db8::1 172.30.149.249 10.0.0.5\n')

      const ip = getWslIp()

      expect(ip).toBe('172.30.149.249')
    })

    it('returns null when hostname -I fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed')
      })

      const ip = getWslIp()

      expect(ip).toBeNull()
    })

    it('returns null when no IPv4 addresses found', () => {
      vi.mocked(execSync).mockReturnValue('fe80::1 2001:db8::1\n')

      const ip = getWslIp()

      expect(ip).toBeNull()
    })

    it('returns null when output is empty', () => {
      vi.mocked(execSync).mockReturnValue('')

      const ip = getWslIp()

      expect(ip).toBeNull()
    })
  })
})
