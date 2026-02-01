import { describe, it, expect } from 'vitest'
import type { ClaudeSession } from '../../../server/claude-indexer'
import { applyOverride } from '../../../server/claude-indexer'

describe('claude-indexer applyOverride', () => {
  it('returns null when override marks deleted', () => {
    const session: ClaudeSession = {
      sessionId: 's1',
      projectPath: '/proj',
      createdAt: 100,
      updatedAt: 200,
    }

    expect(applyOverride(session, { deleted: true })).toBeNull()
  })

  it('applies title/summary/archived and createdAt overrides', () => {
    const session: ClaudeSession = {
      sessionId: 's1',
      projectPath: '/proj',
      createdAt: 100,
      updatedAt: 200,
      title: 'Original',
      summary: 'Summary',
      archived: false,
    }

    const merged = applyOverride(session, {
      titleOverride: 'New title',
      summaryOverride: 'New summary',
      archived: true,
      createdAtOverride: 999,
    })

    expect(merged?.title).toBe('New title')
    expect(merged?.summary).toBe('New summary')
    expect(merged?.archived).toBe(true)
    expect(merged?.createdAt).toBe(999)
  })
})
