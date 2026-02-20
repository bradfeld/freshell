#!/usr/bin/env tsx

/**
 * Pre-build guard: prevents building over a live production dist/.
 *
 * Checks if a Freshell production server is running on the configured port.
 * If so, blocks the build and suggests safe alternatives.
 */

export interface ProdCheckResult {
  status: 'running' | 'not-running'
  version?: string
}

export async function checkProdRunning(port: number): Promise<ProdCheckResult> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return { status: 'not-running' }
    }

    const data = (await res.json()) as { app?: string; version?: string }
    if (data.app === 'freshell') {
      return { status: 'running', version: data.version }
    }

    return { status: 'not-running' }
  } catch {
    return { status: 'not-running' }
  }
}

export async function main(): Promise<void> {
  throw new Error('Not implemented')
}

// Only run when executed directly (not imported by tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main()
}
