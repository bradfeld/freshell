import { describe, it, expect } from 'vitest'
import { getSessionsForHello, findTabIdForSession } from '@/lib/session-utils'
import type { RootState } from '@/store/store'
import type { PaneNode, TerminalPaneContent } from '@/store/paneTypes'

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_SESSION_ID = '6f1c2b3a-4d5e-6f70-8a9b-0c1d2e3f4a5b'

function terminalContent(mode: TerminalPaneContent['mode'], resumeSessionId: string): TerminalPaneContent {
  return {
    kind: 'terminal',
    mode,
    status: 'running',
    createRequestId: `req-${resumeSessionId}`,
    resumeSessionId,
  }
}

function leaf(id: string, content: TerminalPaneContent): PaneNode {
  return {
    type: 'leaf',
    id,
    content,
  }
}

describe('getSessionsForHello', () => {
  it('filters non-claude sessions from active/visible/background', () => {
    const layoutActive: PaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        leaf('pane-codex', terminalContent('codex', 'codex-active')),
        leaf('pane-claude', terminalContent('claude', VALID_SESSION_ID)),
      ],
    }

    const layoutBackground: PaneNode = {
      type: 'split',
      id: 'split-2',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        leaf('pane-claude-bg', terminalContent('claude', OTHER_SESSION_ID)),
        leaf('pane-codex-bg', terminalContent('codex', 'codex-bg')),
      ],
    }

    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }, { id: 'tab-2' }],
      },
      panes: {
        layouts: {
          'tab-1': layoutActive,
          'tab-2': layoutBackground,
        },
        activePane: {
          'tab-1': 'pane-codex',
        },
      },
    } as unknown as RootState

    const result = getSessionsForHello(state)

    expect(result.active).toBeUndefined()
    expect(result.visible).toEqual([VALID_SESSION_ID])
    expect(result.background).toEqual([OTHER_SESSION_ID])
  })

  it('captures active claude session when active pane is claude', () => {
    const layoutActive: PaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        leaf('pane-claude', terminalContent('claude', VALID_SESSION_ID)),
        leaf('pane-codex', terminalContent('codex', 'codex-visible')),
      ],
    }

    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: {
          'tab-1': layoutActive,
        },
        activePane: {
          'tab-1': 'pane-claude',
        },
      },
    } as unknown as RootState

    const result = getSessionsForHello(state)

    expect(result.active).toBe(VALID_SESSION_ID)
    expect(result.visible).toEqual([])
    expect(result.background).toBeUndefined()
  })

  it('drops invalid claude session IDs', () => {
    const layoutActive: PaneNode = {
      type: 'leaf',
      id: 'pane-claude',
      content: terminalContent('claude', 'not-a-uuid'),
    }

    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1' }],
      },
      panes: {
        layouts: {
          'tab-1': layoutActive,
        },
        activePane: {
          'tab-1': 'pane-claude',
        },
      },
    } as unknown as RootState

    const result = getSessionsForHello(state)

    expect(result.active).toBeUndefined()
    expect(result.visible).toEqual([])
    expect(result.background).toBeUndefined()
  })
})

describe('findTabIdForSession', () => {
  it('falls back to tab resumeSessionId when layout is missing', () => {
    const state = {
      tabs: {
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', mode: 'claude', resumeSessionId: VALID_SESSION_ID }],
      },
      panes: {
        layouts: {},
        activePane: {},
      },
    } as unknown as RootState

    expect(findTabIdForSession(state, 'claude', VALID_SESSION_ID)).toBe('tab-1')
  })
})
