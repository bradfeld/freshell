import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'

import panesReducer, { closePane, updatePaneContent, removeLayout } from '@/store/panesSlice'
import terminalActivityReducer from '@/store/terminalActivitySlice'
import codingCliReducer from '@/store/codingCliSlice'
import { createPaneCleanupListenerMiddleware } from '@/store/paneCleanupListeners'

const mockSend = vi.fn()

vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({ send: mockSend }),
}))

function makeStore(preloadedState: any) {
  const listener = createPaneCleanupListenerMiddleware()
  return configureStore({
    reducer: {
      panes: panesReducer,
      terminalActivity: terminalActivityReducer,
      codingCli: codingCliReducer,
    },
    middleware: (getDefault) => getDefault().prepend(listener.middleware),
    preloadedState,
  })
}

describe('pane cleanup listener middleware', () => {
  beforeEach(() => {
    mockSend.mockClear()
  })

  it('detaches terminal and clears pane activity when a terminal pane is closed', () => {
    const store = makeStore({
      panes: {
        layouts: {
          'tab-1': {
            type: 'split',
            id: 'split-1',
            direction: 'horizontal',
            sizes: [50, 50],
            children: [
              {
                type: 'leaf',
                id: 'pane-term',
                content: {
                  kind: 'terminal',
                  terminalId: 'term-1',
                  createRequestId: 'req-1',
                  status: 'running',
                  mode: 'shell',
                  shell: 'system',
                },
              },
              {
                type: 'leaf',
                id: 'pane-browser',
                content: { kind: 'browser', url: '', devToolsOpen: false },
              },
            ],
          },
        },
        activePane: { 'tab-1': 'pane-term' },
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      terminalActivity: {
        lastOutputAt: { 'pane-term': 123 },
        lastInputAt: {},
        working: { 'pane-term': true },
        finished: {},
      },
      codingCli: {
        sessions: {},
        pendingRequests: {},
      },
    })

    store.dispatch(closePane({ tabId: 'tab-1', paneId: 'pane-term' }))

    expect(mockSend).toHaveBeenCalledWith({ type: 'terminal.detach', terminalId: 'term-1' })
    expect(store.getState().terminalActivity.lastOutputAt['pane-term']).toBeUndefined()
    expect(store.getState().terminalActivity.working['pane-term']).toBeUndefined()
  })

  it('does not detach a terminalId that is still referenced by another pane (reference counting)', () => {
    const store = makeStore({
      panes: {
        layouts: {
          'tab-1': {
            type: 'split',
            id: 'split-1',
            direction: 'horizontal',
            sizes: [50, 50],
            children: [
              {
                type: 'leaf',
                id: 'pane-a',
                content: {
                  kind: 'terminal',
                  terminalId: 'term-shared',
                  createRequestId: 'req-a',
                  status: 'running',
                  mode: 'shell',
                  shell: 'system',
                },
              },
              {
                type: 'leaf',
                id: 'pane-b',
                content: {
                  kind: 'terminal',
                  terminalId: 'term-shared',
                  createRequestId: 'req-b',
                  status: 'running',
                  mode: 'shell',
                  shell: 'system',
                },
              },
            ],
          },
        },
        activePane: { 'tab-1': 'pane-a' },
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      terminalActivity: {
        lastOutputAt: { 'pane-a': 1, 'pane-b': 2 },
        lastInputAt: {},
        working: { 'pane-a': true, 'pane-b': true },
        finished: {},
      },
      codingCli: { sessions: {}, pendingRequests: {} },
    })

    store.dispatch(closePane({ tabId: 'tab-1', paneId: 'pane-a' }))

    // Pane A is gone, but Pane B still references the same terminalId: do not detach the websocket.
    expect(mockSend).not.toHaveBeenCalledWith({ type: 'terminal.detach', terminalId: 'term-shared' })
    expect(store.getState().terminalActivity.lastOutputAt['pane-a']).toBeUndefined()
    expect(store.getState().terminalActivity.lastOutputAt['pane-b']).toBe(2)
  })

  it('detaches a shared terminalId only when the last referencing pane changes away', () => {
    const store = makeStore({
      panes: {
        layouts: {
          'tab-1': {
            type: 'split',
            id: 'split-1',
            direction: 'horizontal',
            sizes: [50, 50],
            children: [
              {
                type: 'leaf',
                id: 'pane-a',
                content: {
                  kind: 'terminal',
                  terminalId: 'term-shared',
                  createRequestId: 'req-a',
                  status: 'running',
                  mode: 'shell',
                  shell: 'system',
                },
              },
              {
                type: 'leaf',
                id: 'pane-b',
                content: {
                  kind: 'terminal',
                  terminalId: 'term-shared',
                  createRequestId: 'req-b',
                  status: 'running',
                  mode: 'shell',
                  shell: 'system',
                },
              },
            ],
          },
        },
        activePane: { 'tab-1': 'pane-a' },
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      terminalActivity: { lastOutputAt: {}, lastInputAt: {}, working: {}, finished: {} },
      codingCli: { sessions: {}, pendingRequests: {} },
    })

    store.dispatch(closePane({ tabId: 'tab-1', paneId: 'pane-a' }))
    expect(mockSend).not.toHaveBeenCalledWith({ type: 'terminal.detach', terminalId: 'term-shared' })

    mockSend.mockClear()

    store.dispatch(updatePaneContent({
      tabId: 'tab-1',
      paneId: 'pane-b',
      content: { kind: 'browser', url: 'https://example.com', devToolsOpen: false },
    }))

    expect(mockSend).toHaveBeenCalledWith({ type: 'terminal.detach', terminalId: 'term-shared' })
  })

  it('cancels terminal.create by requestId when closing a creating terminal pane with no terminalId yet', () => {
    const store = makeStore({
      panes: {
        layouts: {
          'tab-1': {
            type: 'split',
            id: 'split-1',
            direction: 'horizontal',
            sizes: [50, 50],
            children: [
              {
                type: 'leaf',
                id: 'pane-term',
                content: {
                  kind: 'terminal',
                  terminalId: undefined,
                  createRequestId: 'req-creating',
                  status: 'creating',
                  mode: 'shell',
                  shell: 'system',
                },
              },
              {
                type: 'leaf',
                id: 'pane-other',
                content: { kind: 'browser', url: 'https://example.com', devToolsOpen: false },
              },
            ],
          },
        },
        activePane: { 'tab-1': 'pane-term' },
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      terminalActivity: { lastOutputAt: {}, lastInputAt: {}, working: {}, finished: {} },
      codingCli: { sessions: {}, pendingRequests: {} },
    })

    store.dispatch(closePane({ tabId: 'tab-1', paneId: 'pane-term' }))

    expect(mockSend).toHaveBeenCalledWith({ type: 'terminal.create.cancel', requestId: 'req-creating' })
  })

  it('detaches terminal when pane content changes from terminal to browser', () => {
    const store = makeStore({
      panes: {
        layouts: {
          'tab-1': {
            type: 'leaf',
            id: 'pane-1',
            content: {
              kind: 'terminal',
              terminalId: 'term-1',
              createRequestId: 'req-1',
              status: 'running',
              mode: 'shell',
              shell: 'system',
            },
          },
        },
        activePane: { 'tab-1': 'pane-1' },
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      terminalActivity: {
        lastOutputAt: { 'pane-1': 1 },
        lastInputAt: {},
        working: { 'pane-1': true },
        finished: {},
      },
      codingCli: {
        sessions: {},
        pendingRequests: {},
      },
    })

    store.dispatch(updatePaneContent({
      tabId: 'tab-1',
      paneId: 'pane-1',
      content: { kind: 'browser', url: 'https://example.com', devToolsOpen: false },
    }))

    expect(mockSend).toHaveBeenCalledWith({ type: 'terminal.detach', terminalId: 'term-1' })
    expect(store.getState().terminalActivity.lastOutputAt['pane-1']).toBeUndefined()
  })

  it('kills coding CLI session when pane content changes away from session', () => {
    const store = makeStore({
      panes: {
        layouts: {
          'tab-1': {
            type: 'leaf',
            id: 'pane-1',
            content: { kind: 'session', sessionId: 's1', provider: 'claude', title: 'Session' },
          },
        },
        activePane: { 'tab-1': 'pane-1' },
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      terminalActivity: { lastOutputAt: {}, lastInputAt: {}, working: {}, finished: {} },
      codingCli: { sessions: {}, pendingRequests: {} },
    })

    store.dispatch(updatePaneContent({
      tabId: 'tab-1',
      paneId: 'pane-1',
      content: { kind: 'browser', url: '', devToolsOpen: false },
    }))

    expect(mockSend).toHaveBeenCalledWith({ type: 'codingcli.kill', sessionId: 's1' })
  })

  it('cancels pending coding CLI request instead of killing when pane is removed', () => {
    const store = makeStore({
      panes: {
        layouts: {
          'tab-1': {
            type: 'leaf',
            id: 'pane-1',
            content: { kind: 'session', sessionId: 's1', provider: 'claude', title: 'Session' },
          },
        },
        activePane: { 'tab-1': 'pane-1' },
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      terminalActivity: { lastOutputAt: {}, lastInputAt: {}, working: {}, finished: {} },
      codingCli: {
        sessions: {},
        pendingRequests: {
          s1: {
            requestId: 's1',
            provider: 'claude',
            prompt: 'Hello',
            createdAt: 1,
          },
        },
      },
    })

    store.dispatch(removeLayout({ tabId: 'tab-1' }))

    expect(mockSend).not.toHaveBeenCalledWith({ type: 'codingcli.kill', sessionId: 's1' })
    expect(store.getState().codingCli.pendingRequests.s1.canceled).toBe(true)
  })
})
