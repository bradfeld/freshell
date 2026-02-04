import * as net from 'net'
import { logger } from './logger.js'

const log = logger.child({ component: 'port-forward' })

interface ForwardEntry {
  /** Port the proxy listens on (assigned by OS) */
  localPort: number
  /** The localhost port being forwarded to */
  targetPort: number
  /** The TCP server accepting connections */
  server: net.Server
  /** Active client connections (for cleanup) */
  connections: Set<net.Socket>
  /** Timestamp of last connection activity */
  lastActivity: number
}

export interface PortForwardOptions {
  /** How long (ms) a forward can be idle before auto-cleanup. Default: 5 minutes. */
  idleTimeoutMs?: number
}

export class PortForwardManager {
  private forwards = new Map<number, ForwardEntry>()
  private idleTimeoutMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(opts: PortForwardOptions = {}) {
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 5 * 60 * 1000
    this.startIdleCleanup()
  }

  /**
   * Create (or reuse) a TCP forward from a random OS-assigned port to
   * 127.0.0.1:<targetPort>. Returns the local port the proxy listens on.
   */
  async forward(targetPort: number): Promise<{ port: number }> {
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      throw new Error(`Invalid target port: ${targetPort}`)
    }

    // Reuse existing forward
    const existing = this.forwards.get(targetPort)
    if (existing) {
      existing.lastActivity = Date.now()
      return { port: existing.localPort }
    }

    return new Promise<{ port: number }>((resolve, reject) => {
      const server = net.createServer((clientSocket) => {
        const entry = this.forwards.get(targetPort)
        if (entry) {
          entry.lastActivity = Date.now()
          entry.connections.add(clientSocket)
        }

        const targetSocket = net.createConnection(
          { host: '127.0.0.1', port: targetPort },
          () => {
            clientSocket.pipe(targetSocket)
            targetSocket.pipe(clientSocket)
          },
        )

        const cleanup = () => {
          clientSocket.destroy()
          targetSocket.destroy()
          if (entry) entry.connections.delete(clientSocket)
        }

        clientSocket.on('error', cleanup)
        targetSocket.on('error', (err) => {
          // Propagate target errors to the client so it sees the failure
          clientSocket.destroy(err)
          targetSocket.destroy()
          if (entry) entry.connections.delete(clientSocket)
        })
        clientSocket.on('close', cleanup)
        targetSocket.on('close', cleanup)
      })

      server.on('error', (err) => {
        reject(err)
      })

      // Listen on port 0 → OS assigns an available port.
      // Bind to 0.0.0.0 so remote clients can reach it.
      server.listen(0, '0.0.0.0', () => {
        const addr = server.address() as net.AddressInfo
        const entry: ForwardEntry = {
          localPort: addr.port,
          targetPort,
          server,
          connections: new Set(),
          lastActivity: Date.now(),
        }
        this.forwards.set(targetPort, entry)
        log.info(
          { targetPort, localPort: addr.port },
          'Port forward created',
        )
        resolve({ port: addr.port })
      })
    })
  }

  /** Return the forwarded local port for a given target port, or undefined. */
  getForwardedPort(targetPort: number): number | undefined {
    return this.forwards.get(targetPort)?.localPort
  }

  /** Close a single forward by target port. */
  close(targetPort: number): void {
    const entry = this.forwards.get(targetPort)
    if (!entry) return

    for (const conn of entry.connections) {
      conn.destroy()
    }
    entry.server.close()
    this.forwards.delete(targetPort)
    log.info(
      { targetPort, localPort: entry.localPort },
      'Port forward closed',
    )
  }

  /** Close all active forwards and stop the idle-cleanup timer. */
  closeAll(): void {
    for (const targetPort of [...this.forwards.keys()]) {
      this.close(targetPort)
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private startIdleCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [targetPort, entry] of this.forwards) {
        const idle = now - entry.lastActivity > this.idleTimeoutMs
        const noConnections = entry.connections.size === 0
        if (idle && noConnections) {
          log.info(
            { targetPort, localPort: entry.localPort },
            'Port forward idle-closed',
          )
          this.close(targetPort)
        }
      }
    }, 60_000)

    // Don't let the timer keep the process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref()
    }
  }
}
