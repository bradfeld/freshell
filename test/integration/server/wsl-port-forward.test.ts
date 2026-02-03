// test/integration/server/wsl-port-forward.test.ts
import { describe, it, expect } from 'vitest'

// This test verifies the bootstrap integration without actually running elevated commands
describe('WSL port forwarding bootstrap integration', () => {
  it('bootstrap module exports setupWslPortForwarding', async () => {
    // Dynamically import to verify the module structure
    const wslModule = await import('../../../server/wsl-port-forward.js')

    expect(typeof wslModule.setupWslPortForwarding).toBe('function')
    expect(typeof wslModule.getWslIp).toBe('function')
    expect(typeof wslModule.getRequiredPorts).toBe('function')
    expect(typeof wslModule.needsPortForwardingUpdate).toBe('function')
    expect(typeof wslModule.buildPortForwardingScript).toBe('function')
  })

  it('wsl-port-forward module exports SetupResult type', async () => {
    // Verify the type is exported (TypeScript compile-time check)
    // At runtime we can only verify the module structure
    const wslModule = await import('../../../server/wsl-port-forward.js')

    // setupWslPortForwarding returns SetupResult type
    // Verify it's a function that can be called (type will enforce return type at compile time)
    expect(typeof wslModule.setupWslPortForwarding).toBe('function')
  })
})
