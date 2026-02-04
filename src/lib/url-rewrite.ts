const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * Returns true if the hostname refers to the local machine.
 * Handles both bare (::1) and bracketed ([::1]) IPv6 forms.
 */
export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname)
}
