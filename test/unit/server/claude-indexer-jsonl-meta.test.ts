import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { parseSessionJsonlMeta, parseSessionContent } from '../../../server/claude-indexer'

describe('parseSessionJsonlMeta', () => {
  let tempDir: string
  let sessionFile: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-jsonl-meta-'))
    sessionFile = path.join(tempDir, 'session.jsonl')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('respects maxBytes when reading metadata', async () => {
    const line1 = JSON.stringify({
      cwd: '/tmp',
      role: 'user',
      content: 'First title',
      timestamp: '2025-01-02T00:00:05.000Z',
    })
    const line2 = JSON.stringify({
      summary: 'Second summary',
      timestamp: '2025-01-02T00:00:01.000Z',
    })

    await fs.writeFile(sessionFile, `${line1}\n${line2}\n`)

    const maxBytes = Buffer.byteLength(line1, 'utf8') + 1
    const meta = await parseSessionJsonlMeta(sessionFile, { maxBytes })

    expect(meta.title).toContain('First title')
    expect(meta.summary).toBeUndefined()
    expect(meta.messageCount).toBe(1)
    expect(meta.createdAt).toBe(Date.parse('2025-01-02T00:00:05.000Z'))
  })

  it('continues reading when metadata is incomplete', async () => {
    const line1 = JSON.stringify({
      cwd: '/tmp',
      role: 'user',
      content: 'First title',
      timestamp: '2025-01-02T00:00:05.000Z',
    })
    const line2 = JSON.stringify({
      summary: 'Second summary',
      timestamp: '2025-01-02T00:00:01.000Z',
    })

    await fs.writeFile(sessionFile, `${line1}\n${line2}\n`)

    const maxBytes = Buffer.byteLength(`${line1}\n${line2}\n`, 'utf8') + 10
    const meta = await parseSessionJsonlMeta(sessionFile, { maxBytes })

    expect(meta.title).toContain('First title')
    expect(meta.summary).toBe('Second summary')
    expect(meta.messageCount).toBe(2)
    expect(meta.createdAt).toBe(Date.parse('2025-01-02T00:00:01.000Z'))
  })
})

describe('parseSessionContent sessionId extraction', () => {
  it('extracts sessionId from content when present', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    const content = `{"sessionId":"${id}","cwd":"/tmp"}`
    const meta = parseSessionContent(content)
    expect(meta.sessionId).toBe(id)
  })

  it('accepts session_id when sessionId is not present', () => {
    const id = '6f1c2b3a-4d5e-6f70-8a9b-0c1d2e3f4a5b'
    const content = `{"type":"system","session_id":"${id}"}`
    const meta = parseSessionContent(content)
    expect(meta.sessionId).toBe(id)
  })

  it('ignores non-UUID sessionId candidates', () => {
    const content = '{"sessionId":"not-a-uuid","cwd":"/tmp"}'
    const meta = parseSessionContent(content)
    expect(meta.sessionId).toBeUndefined()
  })
})
