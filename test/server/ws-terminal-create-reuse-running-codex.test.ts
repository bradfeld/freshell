import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import WebSocket from 'ws'

const HOOK_TIMEOUT_MS = 30_000
const CODEX_SESSION_ID = 'codex-session-abc-123'

function listen(server: http.Server, timeoutMs = HOOK_TIMEOUT_MS): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out')), timeoutMs)
    const onError = (err: Error) => { clearTimeout(timeout); reject(err) }
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      clearTimeout(timeout)
      server.off('error', onError)
      const addr = server.address()
      if (typeof addr === 'object' && addr) resolve({ port: addr.port })
    })
  })
}

function waitForMessage(ws: WebSocket, predicate: (msg: any) => boolean, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', handler)
      reject(new Error('Timeout waiting for message'))
    }, timeoutMs)
    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString())
      if (predicate(msg)) {
        clearTimeout(timeout)
        ws.off('message', handler)
        resolve(msg)
      }
    }
    ws.on('message', handler)
  })
}

class FakeBuffer {
  snapshot() { return 'codex session output' }
}

class FakeRegistry {
  record: any
  attachCalls: Array<{ terminalId: string; opts?: any }> = []
  finishAttachSnapshotCalls: Array<{ terminalId: string }> = []
  createCalls: any[] = []

  constructor(terminalId: string) {
    this.record = {
      terminalId,
      createdAt: Date.now(),
      buffer: new FakeBuffer(),
      mode: 'codex',
      shell: 'system',
      status: 'running',
      resumeSessionId: CODEX_SESSION_ID,
      clients: new Set<WebSocket>(),
    }
  }

  get(terminalId: string) {
    return this.record.terminalId === terminalId ? this.record : null
  }

  findRunningTerminalBySession(mode: string, sessionId: string) {
    if (mode === this.record.mode && sessionId === CODEX_SESSION_ID) return this.record
    return undefined
  }

  findRunningClaudeTerminalBySession(sessionId: string) {
    return this.findRunningTerminalBySession('claude', sessionId)
  }

  attach(terminalId: string, ws: WebSocket, opts?: any) {
    this.attachCalls.push({ terminalId, opts })
    this.record.clients.add(ws)
    return this.record
  }

  finishAttachSnapshot(terminalId: string, _ws: WebSocket) {
    this.finishAttachSnapshotCalls.push({ terminalId })
  }

  detach(_terminalId: string, ws: WebSocket) {
    this.record.clients.delete(ws)
    return true
  }

  create(opts: any) {
    this.createCalls.push(opts)
    return this.record
  }

  list() { return [] }
}

describe('terminal.create reuse running codex terminal', () => {
  let server: http.Server | undefined
  let port: number
  let registry: FakeRegistry

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.AUTH_TOKEN = 'testtoken-testtoken'
    process.env.HELLO_TIMEOUT_MS = '100'

    const { WsHandler } = await import('../../server/ws-handler')
    server = http.createServer((_req, res) => { res.statusCode = 404; res.end() })
    registry = new FakeRegistry('term-codex-existing')
    new WsHandler(server, registry as any)
    const info = await listen(server)
    port = info.port
  }, HOOK_TIMEOUT_MS)

  beforeEach(() => {
    registry.attachCalls = []
    registry.finishAttachSnapshotCalls = []
    registry.createCalls = []
  })

  afterAll(async () => {
    if (!server) return
    await new Promise<void>((resolve) => server!.close(() => resolve()))
  }, HOOK_TIMEOUT_MS)

  it('reuses existing codex terminal instead of creating new one', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    try {
      await new Promise<void>((resolve) => ws.on('open', () => resolve()))
      ws.send(JSON.stringify({ type: 'hello', token: 'testtoken-testtoken' }))
      await waitForMessage(ws, (m) => m.type === 'ready')

      const requestId = 'codex-reuse-1'
      ws.send(JSON.stringify({
        type: 'terminal.create',
        requestId,
        mode: 'codex',
        resumeSessionId: CODEX_SESSION_ID,
      }))

      const created = await waitForMessage(ws, (m) => m.type === 'terminal.created' && m.requestId === requestId)

      // Should reuse existing terminal, not create a new one
      expect(created.terminalId).toBe('term-codex-existing')
      expect(registry.attachCalls).toHaveLength(1)
      expect(registry.attachCalls[0]?.terminalId).toBe('term-codex-existing')
      expect(registry.createCalls).toHaveLength(0)

      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(registry.finishAttachSnapshotCalls).toHaveLength(1)
    } finally {
      ws.close()
    }
  })

  it('returns effectiveResumeSessionId from reused codex terminal', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    try {
      await new Promise<void>((resolve) => ws.on('open', () => resolve()))
      ws.send(JSON.stringify({ type: 'hello', token: 'testtoken-testtoken' }))
      await waitForMessage(ws, (m) => m.type === 'ready')

      const requestId = 'codex-reuse-2'
      ws.send(JSON.stringify({
        type: 'terminal.create',
        requestId,
        mode: 'codex',
        resumeSessionId: CODEX_SESSION_ID,
      }))

      const created = await waitForMessage(ws, (m) => m.type === 'terminal.created' && m.requestId === requestId)
      expect(created.effectiveResumeSessionId).toBe(CODEX_SESSION_ID)
    } finally {
      ws.close()
    }
  })
})
