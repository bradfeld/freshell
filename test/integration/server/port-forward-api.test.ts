import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import * as net from 'net'
import { PortForwardManager } from '../../../server/port-forward.js'
import { getRequesterIdentity, parseTrustProxyEnv } from '../../../server/request-ip.js'

const TEST_AUTH_TOKEN = 'test-auth-token-12345678'

// Helper: create a TCP server on localhost that echoes data back
function createEchoServer(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.pipe(socket)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      resolve({ server, port: addr.port })
    })
  })
}

describe('Port Forward API Integration', () => {
  let app: Express
  let manager: PortForwardManager
  let echoServer: { server: net.Server; port: number } | null = null

  beforeAll(() => {
    process.env.AUTH_TOKEN = TEST_AUTH_TOKEN
    process.env.FRESHELL_TRUST_PROXY = 'loopback'
    manager = new PortForwardManager({ idleTimeoutMs: 60_000 })

    app = express()
    app.use(express.json({ limit: '1mb' }))
    app.set('trust proxy', parseTrustProxyEnv(process.env.FRESHELL_TRUST_PROXY))

    // Auth middleware (matches server/auth.ts)
    app.use('/api', (req, res, next) => {
      const token = process.env.AUTH_TOKEN
      const provided = req.headers['x-auth-token'] as string | undefined
      if (!provided || provided !== token) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      next()
    })

    // Register the endpoint under test
    app.post('/api/proxy/forward', async (req, res) => {
      const { port } = req.body || {}

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return res.status(400).json({ error: 'Invalid port number' })
      }

      try {
        const requester = getRequesterIdentity(req)
        const result = await manager.forward(port, requester)
        res.json({ forwardedPort: result.port })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        res.status(500).json({ error: `Failed to create port forward: ${msg}` })
      }
    })

    app.delete('/api/proxy/forward/:port', (req, res) => {
      const port = parseInt(req.params.port, 10)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return res.status(400).json({ error: 'Invalid port number' })
      }
      const requester = getRequesterIdentity(req)
      manager.close(port, requester.key)
      res.json({ ok: true })
    })
  })

  afterEach(() => {
    if (echoServer) {
      echoServer.server.close()
      echoServer = null
    }
  })

  afterAll(() => {
    manager.closeAll()
    delete process.env.FRESHELL_TRUST_PROXY
  })

  describe('POST /api/proxy/forward', () => {
    it('requires authentication', async () => {
      await request(app)
        .post('/api/proxy/forward')
        .send({ port: 3000 })
        .expect(401)
    })

    it('rejects missing port', async () => {
      await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({})
        .expect(400)
    })

    it('rejects invalid port numbers', async () => {
      await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({ port: 0 })
        .expect(400)

      await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({ port: 70000 })
        .expect(400)

      await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({ port: 'abc' })
        .expect(400)
    })

    it('creates a port forward and returns the forwarded port', async () => {
      echoServer = await createEchoServer()

      const res = await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({ port: echoServer.port })
        .expect(200)

      expect(res.body.forwardedPort).toBeGreaterThan(0)
      expect(res.body.forwardedPort).not.toBe(echoServer.port)
    })

    it('returns the same forwarded port for repeated requests', async () => {
      echoServer = await createEchoServer()

      const res1 = await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({ port: echoServer.port })
        .expect(200)

      const res2 = await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({ port: echoServer.port })
        .expect(200)

      expect(res1.body.forwardedPort).toBe(res2.body.forwardedPort)
    })

    it('creates separate forwards for different requester IPs', async () => {
      echoServer = await createEchoServer()

      const res1 = await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .set('x-forwarded-for', '203.0.113.5')
        .send({ port: echoServer.port })
        .expect(200)

      const res2 = await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .set('x-forwarded-for', '203.0.113.6')
        .send({ port: echoServer.port })
        .expect(200)

      expect(res1.body.forwardedPort).not.toBe(res2.body.forwardedPort)
    })

    it('drops connections from non-requester IPs when X-Forwarded-For is trusted', async () => {
      echoServer = await createEchoServer()

      const res = await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .set('x-forwarded-for', '203.0.113.10')
        .send({ port: echoServer.port })
        .expect(200)

      const forwardedPort = res.body.forwardedPort

      await expect(
        new Promise((resolve, reject) => {
          const socket = net.createConnection(
            { host: '127.0.0.1', port: forwardedPort },
            () => {
              socket.write('ping')
            },
          )
          const chunks: Buffer[] = []
          socket.on('data', (chunk) => chunks.push(chunk))
          socket.on('error', reject)
          socket.on('close', () => {
            if (chunks.length === 0) {
              reject(new Error('Connection closed without data'))
            } else {
              resolve(Buffer.concat(chunks).toString())
            }
          })
          socket.setTimeout(2000, () => {
            socket.destroy(new Error('timeout'))
          })
        }),
      ).rejects.toThrow()

      await request(app)
        .delete(`/api/proxy/forward/${echoServer.port}`)
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .set('x-forwarded-for', '203.0.113.10')
        .expect(200)
    })
  })

  describe('DELETE /api/proxy/forward/:port', () => {
    it('requires authentication', async () => {
      await request(app)
        .delete('/api/proxy/forward/3000')
        .expect(401)
    })

    it('closes an existing forward', async () => {
      echoServer = await createEchoServer()

      // Create the forward
      const res = await request(app)
        .post('/api/proxy/forward')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .send({ port: echoServer.port })
        .expect(200)

      const forwardedPort = res.body.forwardedPort

      // Delete it
      await request(app)
        .delete(`/api/proxy/forward/${echoServer.port}`)
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .expect(200)

      // Verify the forwarded port is no longer listening
      await expect(
        new Promise((resolve, reject) => {
          const socket = net.createConnection(
            { host: '127.0.0.1', port: forwardedPort },
            () => {
              socket.destroy()
              resolve('connected')
            },
          )
          socket.on('error', reject)
          socket.setTimeout(2000, () => {
            socket.destroy(new Error('timeout'))
          })
        }),
      ).rejects.toThrow()
    })

    it('is a no-op for non-existent forwards', async () => {
      await request(app)
        .delete('/api/proxy/forward/12345')
        .set('x-auth-token', TEST_AUTH_TOKEN)
        .expect(200)
    })
  })
})
