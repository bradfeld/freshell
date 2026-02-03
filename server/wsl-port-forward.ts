import { execSync } from 'child_process'

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/**
 * Get the current WSL2 IPv4 address.
 * Returns the first IPv4 address from `hostname -I`, skipping any IPv6 addresses.
 */
export function getWslIp(): string | null {
  try {
    const output = execSync('hostname -I', { encoding: 'utf-8', timeout: 5000 })
    const addresses = output.trim().split(/\s+/).filter(Boolean)

    // Find first IPv4 address (skip IPv6)
    for (const addr of addresses) {
      if (IPV4_REGEX.test(addr)) {
        return addr
      }
    }
    return null
  } catch {
    return null
  }
}
