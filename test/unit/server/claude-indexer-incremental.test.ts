import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { ClaudeSessionIndexer } from '../../../server/claude-indexer'
import { configStore } from '../../../server/config-store'

describe('ClaudeSessionIndexer incremental updates', () => {
  let tempDir: string
  let claudeHome: string
  let projectDir: string
  let sessionFile: string
  const originalClaudeHome = process.env.CLAUDE_HOME

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-indexer-incremental-'))
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

  it('updates a session incrementally when file content changes', async () => {
    await fs.writeFile(sessionFile, '{"cwd":"/tmp","role":"user","content":"First title"}\n')

    const indexer = new ClaudeSessionIndexer()
    await indexer.refresh()

    const before = indexer.getProjects()[0].sessions[0]
    expect(before.title).toContain('First title')

    await fs.writeFile(sessionFile, '{"cwd":"/tmp","role":"user","content":"Updated title"}\n')
    await (indexer as any).upsertSessionFromFile(sessionFile)

    const after = indexer.getProjects()[0].sessions[0]
    expect(after.title).toContain('Updated title')
  })

  it('removes sessions incrementally when files disappear', async () => {
    const embeddedId = '6f1c2b3a-4d5e-6f70-8a9b-0c1d2e3f4a5b'
    await fs.writeFile(
      sessionFile,
      `{"sessionId":"${embeddedId}","cwd":"/tmp","role":"user","content":"One"}\n`
    )

    const indexer = new ClaudeSessionIndexer()
    await indexer.refresh()
    expect(indexer.getProjects().length).toBe(1)

    await fs.rm(sessionFile)
    await (indexer as any).upsertSessionFromFile(sessionFile)

    expect(indexer.getProjects().length).toBe(0)
  })
})
