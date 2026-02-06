import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { ClaudeSessionIndexer } from '../../../server/claude-indexer'
import { configStore } from '../../../server/config-store'
import { logger } from '../../../server/logger'

describe('ClaudeSessionIndexer refresh integration', () => {
  let tempDir: string
  let claudeHome: string
  let projectDir: string
  let sessionFile: string
  const originalClaudeHome = process.env.CLAUDE_HOME

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-refresh-'))
    claudeHome = path.join(tempDir, '.claude')
    projectDir = path.join(claudeHome, 'projects', 'project-a')
    sessionFile = path.join(projectDir, '550e8400-e29b-41d4-a716-446655440000.jsonl')
    await fs.mkdir(projectDir, { recursive: true })

    process.env.CLAUDE_HOME = claudeHome

    vi.spyOn(configStore, 'snapshot').mockResolvedValue({
      version: 1,
      settings: {},
      sessionOverrides: {},
      terminalOverrides: {},
      projectColors: {},
    } as any)
    vi.spyOn(configStore, 'getProjectColors').mockResolvedValue({})
  })

  afterEach(async () => {
    if (originalClaudeHome === undefined) {
      delete process.env.CLAUDE_HOME
    } else {
      process.env.CLAUDE_HOME = originalClaudeHome
    }
    vi.restoreAllMocks()
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('reads metadata across multiple lines during refresh', async () => {
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

    const indexer = new ClaudeSessionIndexer()
    await indexer.refresh()

    const session = indexer.getProjects()[0].sessions[0]
    expect(session.title).toContain('First title')
    expect(session.summary).toBe('Second summary')
    expect(session.messageCount).toBe(2)
    expect(session.createdAt).toBe(Date.parse('2025-01-02T00:00:01.000Z'))
  })

  it('prefers embedded sessionId over filename when both are valid', async () => {
    const embeddedId = '550e8400-e29b-41d4-a716-446655440000'
    const filenameId = '6f1c2b3a-4d5e-6f70-8a9b-0c1d2e3f4a5b'
    const filePath = path.join(projectDir, `${filenameId}.jsonl`)

    const line = JSON.stringify({
      sessionId: embeddedId,
      cwd: '/tmp',
      role: 'user',
      content: 'Title',
    })
    await fs.writeFile(filePath, `${line}\n`)

    const indexer = new ClaudeSessionIndexer()
    await indexer.refresh()

    const session = indexer.getProjects()[0].sessions[0]
    expect(session.sessionId).toBe(embeddedId)
    expect(indexer.getFilePathForSession(embeddedId)).toBe(filePath)
  })

  it('skips sessions when both embedded and filename IDs are invalid', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const invalidFile = path.join(projectDir, 'not-a-uuid.jsonl')
    await fs.writeFile(invalidFile, '{"sessionId":"also-not-uuid","cwd":"/tmp"}\n')

    const indexer = new ClaudeSessionIndexer()
    await indexer.refresh()

    expect(indexer.getProjects()).toHaveLength(0)
    const logged = warnSpy.mock.calls.some(([, msg]) => typeof msg === 'string' && msg.includes('invalid sessionId'))
    expect(logged).toBe(true)

    warnSpy.mockRestore()
  })
})
