import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import panesReducer, { hydratePanes } from '@/store/panesSlice'
import tabsReducer, { hydrateTabs } from '@/store/tabsSlice'
import codingCliReducer from '@/store/codingCliSlice'
import terminalActivityReducer, { recordInput, recordOutput } from '@/store/terminalActivitySlice'
import { closePaneWithCleanup } from '@/store/paneThunks'
import { closeTabWithCleanup } from '@/store/tabThunks'
import { createPaneCleanupListenerMiddleware } from '@/store/paneCleanupListeners'
import type { PaneNode, TerminalPaneContent } from '@/store/paneTypes'

const mockSend = vi.fn()

vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({ send: mockSend }),
}))

function makeTerminalContent(id: string): TerminalPaneContent {
  return {
    kind: 'terminal',
    terminalId: `term-${id}`,
    createRequestId: `req-${id}`,
    status: 'running',
    mode: 'shell',
    shell: 'system',
  }
}

function makeLeaf(id: string, content: TerminalPaneContent): PaneNode {
  return { type: 'leaf', id, content }
}

function makeSplit(id: string, children: [PaneNode, PaneNode]): PaneNode {
  return { type: 'split', id, direction: 'horizontal', sizes: [50, 50], children }
}

describe('pane cleanup thunks', () => {
  beforeEach(() => {
    mockSend.mockClear()
  })

  it('closePaneWithCleanup resets terminal activity for a removed pane', () => {
    const listener = createPaneCleanupListenerMiddleware()
    const store = configureStore({
      reducer: {
        panes: panesReducer,
        terminalActivity: terminalActivityReducer,
      },
      middleware: (getDefault) => getDefault().prepend(listener.middleware),
    })

    const tabId = 'tab-1'
    const paneA = 'pane-a'
    const paneB = 'pane-b'

    store.dispatch(hydratePanes({
      layouts: {
        [tabId]: makeSplit('split-1', [
          makeLeaf(paneA, makeTerminalContent('a')),
          makeLeaf(paneB, makeTerminalContent('b')),
        ]),
      },
      activePane: { [tabId]: paneA },
      paneTitles: {},
      paneTitleSetByUser: {},
    }))

    store.dispatch(recordOutput({ paneId: paneA, at: 1 }))
    store.dispatch(recordInput({ paneId: paneA, at: 2 }))
    store.dispatch(recordOutput({ paneId: paneB, at: 3 }))
    store.dispatch(recordInput({ paneId: paneB, at: 4 }))

    store.dispatch(closePaneWithCleanup({ tabId, paneId: paneA }))

    const activity = store.getState().terminalActivity
    expect(activity.lastOutputAt[paneA]).toBeUndefined()
    expect(activity.lastInputAt[paneA]).toBeUndefined()
    expect(activity.lastOutputAt[paneB]).toBe(3)
    expect(activity.lastInputAt[paneB]).toBe(4)

    const root = store.getState().panes.layouts[tabId]
    expect(root.type).toBe('leaf')
    expect(root.id).toBe(paneB)
  })

  it('closeTabWithCleanup resets terminal activity for all removed panes', async () => {
    const listener = createPaneCleanupListenerMiddleware()
    const store = configureStore({
      reducer: {
        tabs: tabsReducer,
        panes: panesReducer,
        codingCli: codingCliReducer,
        terminalActivity: terminalActivityReducer,
      },
      middleware: (getDefault) => getDefault().prepend(listener.middleware),
    })

    const tabId = 'tab-1'
    const paneA = 'pane-a'
    const paneB = 'pane-b'

    store.dispatch(hydrateTabs({
      tabs: [{ id: tabId, title: 'Tab 1', createdAt: 1 }],
      activeTabId: tabId,
      renameRequestTabId: null,
    }))

    store.dispatch(hydratePanes({
      layouts: {
        [tabId]: makeSplit('split-1', [
          makeLeaf(paneA, makeTerminalContent('a')),
          makeLeaf(paneB, makeTerminalContent('b')),
        ]),
      },
      activePane: { [tabId]: paneA },
      paneTitles: {},
      paneTitleSetByUser: {},
    }))

    store.dispatch(recordOutput({ paneId: paneA, at: 1 }))
    store.dispatch(recordOutput({ paneId: paneB, at: 2 }))

    await store.dispatch(closeTabWithCleanup({ tabId }))

    const activity = store.getState().terminalActivity
    expect(activity.lastOutputAt[paneA]).toBeUndefined()
    expect(activity.lastOutputAt[paneB]).toBeUndefined()
    expect(store.getState().panes.layouts[tabId]).toBeUndefined()
    expect(store.getState().tabs.tabs.some((t) => t.id === tabId)).toBe(false)
  })
})
