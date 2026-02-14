import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import tabsReducer from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import settingsReducer, { defaultSettings } from '@/store/settingsSlice'
import connectionReducer from '@/store/connectionSlice'
import type { PaneNode, TerminalPaneContent } from '@/store/paneTypes'

const wsMocks = vi.hoisted(() => ({
  send: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn().mockReturnValue(() => {}),
  onReconnect: vi.fn().mockReturnValue(() => {}),
}))

const runtimeMocks = vi.hoisted(() => ({
  findNext: vi.fn(() => true),
  findPrevious: vi.fn(() => true),
}))

vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({
    send: wsMocks.send,
    connect: wsMocks.connect,
    onMessage: wsMocks.onMessage,
    onReconnect: wsMocks.onReconnect,
  }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    patch: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/lib/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(true),
  readText: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/terminal-themes', () => ({
  getTerminalTheme: () => ({}),
}))

vi.mock('@/components/terminal/terminal-runtime', () => ({
  createTerminalRuntime: () => ({
    attachAddons: vi.fn(),
    fit: vi.fn(),
    findNext: runtimeMocks.findNext,
    findPrevious: runtimeMocks.findPrevious,
    dispose: vi.fn(),
    webglActive: vi.fn(() => false),
  }),
}))

vi.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader" className={className} />,
}))

let capturedKeyHandler: ((event: KeyboardEvent) => boolean) | null = null
let capturedTerminal: { focus: ReturnType<typeof vi.fn> } | null = null

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options: Record<string, unknown> = {}
    cols = 80
    rows = 24
    open = vi.fn()
    loadAddon = vi.fn()
    write = vi.fn()
    writeln = vi.fn()
    clear = vi.fn()
    dispose = vi.fn()
    onData = vi.fn()
    onTitleChange = vi.fn(() => ({ dispose: vi.fn() }))
    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      capturedKeyHandler = handler
    })
    getSelection = vi.fn(() => '')
    focus = vi.fn()

    constructor() {
      capturedTerminal = this
    }
  }

  return { Terminal: MockTerminal }
})

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

import TerminalView from '@/components/TerminalView'

class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

function createTestStore() {
  const tabId = 'tab-1'
  const paneId = 'pane-1'
  const terminalId = 'term-1'

  const paneContent: TerminalPaneContent = {
    kind: 'terminal',
    createRequestId: 'req-1',
    status: 'running',
    mode: 'shell',
    shell: 'system',
    terminalId,
    initialCwd: '/tmp',
  }
  const root: PaneNode = { type: 'leaf', id: paneId, content: paneContent }

  return {
    store: configureStore({
      reducer: {
        tabs: tabsReducer,
        panes: panesReducer,
        settings: settingsReducer,
        connection: connectionReducer,
      },
      preloadedState: {
        tabs: {
          tabs: [{
            id: tabId,
            mode: 'shell',
            status: 'running',
            title: 'Shell',
            titleSetByUser: false,
            createRequestId: 'req-1',
            terminalId,
          }],
          activeTabId: tabId,
        },
        panes: {
          layouts: { [tabId]: root },
          activePane: { [tabId]: paneId },
          paneTitles: {},
        },
        settings: { settings: defaultSettings, status: 'loaded' },
        connection: { status: 'connected', error: null },
      },
    }),
    tabId,
    paneId,
    paneContent,
  }
}

function createKeyboardEvent(key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}): KeyboardEvent {
  return {
    key,
    code: key === 'f' ? 'KeyF' : `Key${key.toUpperCase()}`,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    type: 'keydown',
    repeat: false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

describe('TerminalView search', () => {
  beforeEach(() => {
    capturedKeyHandler = null
    capturedTerminal = null
    runtimeMocks.findNext.mockClear()
    runtimeMocks.findPrevious.mockClear()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens search on Ctrl+F and supports next/previous/escape', async () => {
    const { store, tabId, paneId, paneContent } = createTestStore()

    render(
      <Provider store={store}>
        <TerminalView tabId={tabId} paneId={paneId} paneContent={paneContent} />
      </Provider>,
    )

    await waitFor(() => {
      expect(capturedKeyHandler).not.toBeNull()
    })

    const openSearchEvent = createKeyboardEvent('f', { ctrlKey: true })
    const keyResult = capturedKeyHandler!(openSearchEvent)
    expect(keyResult).toBe(false)
    expect(openSearchEvent.preventDefault).toHaveBeenCalled()

    const input = await screen.findByRole('textbox', { name: 'Terminal search' })
    fireEvent.change(input, { target: { value: 'needle' } })
    expect(runtimeMocks.findNext).toHaveBeenCalledWith('needle', { caseSensitive: false, incremental: true })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(runtimeMocks.findNext).toHaveBeenCalledWith('needle', { caseSensitive: false, incremental: true })

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(runtimeMocks.findPrevious).toHaveBeenCalledWith('needle', { caseSensitive: false, incremental: true })

    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Terminal search' })).not.toBeInTheDocument()
    })
    expect(capturedTerminal?.focus).toHaveBeenCalled()
  })
})
