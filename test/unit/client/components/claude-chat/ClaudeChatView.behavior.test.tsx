import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup, within, act } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import ClaudeChatView from '@/components/claude-chat/ClaudeChatView'
import claudeChatReducer, {
  sessionCreated,
  addUserMessage,
  addAssistantMessage,
  setSessionStatus,
} from '@/store/claudeChatSlice'
import panesReducer from '@/store/panesSlice'
import type { ClaudeChatPaneContent } from '@/store/paneTypes'
import type { ChatContentBlock } from '@/store/claudeChatTypes'

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({
    send: vi.fn(),
    onReconnect: vi.fn(() => vi.fn()),
  }),
}))

function makeStore() {
  return configureStore({
    reducer: {
      claudeChat: claudeChatReducer,
      panes: panesReducer,
    },
  })
}

const BASE_PANE: ClaudeChatPaneContent = {
  kind: 'claude-chat',
  createRequestId: 'req-1',
  sessionId: 'sess-1',
  status: 'idle',
}

/** Add N user→assistant turn pairs to a session in the store. */
function addTurns(
  store: ReturnType<typeof makeStore>,
  count: number,
  toolsPerTurn = 0,
) {
  for (let i = 0; i < count; i++) {
    store.dispatch(addUserMessage({ sessionId: 'sess-1', text: `Question ${i + 1}` }))
    const content: ChatContentBlock[] = [{ type: 'text', text: `Answer ${i + 1}` }]
    for (let t = 0; t < toolsPerTurn; t++) {
      const toolId = `tool-${i}-${t}`
      content.push({
        type: 'tool_use',
        id: toolId,
        name: 'Bash',
        input: { command: `echo ${t}` },
      })
      content.push({
        type: 'tool_result',
        tool_use_id: toolId,
        content: `output ${t}`,
      })
    }
    store.dispatch(addAssistantMessage({ sessionId: 'sess-1', content }))
  }
  // Reset to idle (addAssistantMessage sets to 'running')
  store.dispatch(setSessionStatus({ sessionId: 'sess-1', status: 'idle' }))
}

describe('ClaudeChatView turn collapsing', () => {
  afterEach(cleanup)

  it('shows all turns expanded when total turns <= RECENT_TURNS_FULL (3)', () => {
    const store = makeStore()
    store.dispatch(sessionCreated({ requestId: 'req-1', sessionId: 'sess-1' }))
    addTurns(store, 3)

    render(
      <Provider store={store}>
        <ClaudeChatView tabId="t1" paneId="p1" paneContent={BASE_PANE} />
      </Provider>,
    )

    // All 3 answers should be visible as expanded MessageBubbles
    expect(screen.getByText('Answer 1')).toBeInTheDocument()
    expect(screen.getByText('Answer 2')).toBeInTheDocument()
    expect(screen.getByText('Answer 3')).toBeInTheDocument()
    // No collapsed turn summaries should appear
    expect(screen.queryByLabelText('Expand turn')).not.toBeInTheDocument()
  })

  it('collapses old turns when total turns > RECENT_TURNS_FULL', () => {
    const store = makeStore()
    store.dispatch(sessionCreated({ requestId: 'req-1', sessionId: 'sess-1' }))
    addTurns(store, 5)

    render(
      <Provider store={store}>
        <ClaudeChatView tabId="t1" paneId="p1" paneContent={BASE_PANE} />
      </Provider>,
    )

    // The 2 oldest turns should be collapsed (5 - 3 = 2)
    const expandButtons = screen.getAllByLabelText('Expand turn')
    expect(expandButtons).toHaveLength(2)

    // The 3 most recent turns should show their full content
    expect(screen.getByText('Answer 3')).toBeInTheDocument()
    expect(screen.getByText('Answer 4')).toBeInTheDocument()
    expect(screen.getByText('Answer 5')).toBeInTheDocument()
  })
})

describe('ClaudeChatView thinking indicator', () => {
  afterEach(cleanup)

  it('shows thinking indicator when running + no streaming + last message is user', () => {
    vi.useFakeTimers()
    const store = makeStore()
    store.dispatch(sessionCreated({ requestId: 'req-1', sessionId: 'sess-1' }))
    store.dispatch(addUserMessage({ sessionId: 'sess-1', text: 'Do something' }))
    // addUserMessage sets status to 'running'

    const pane: ClaudeChatPaneContent = { ...BASE_PANE, status: 'running' }
    render(
      <Provider store={store}>
        <ClaudeChatView tabId="t1" paneId="p1" paneContent={pane} />
      </Provider>,
    )

    // ThinkingIndicator has a 200ms debounce
    expect(screen.queryByLabelText('Claude is thinking')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(250) })
    expect(screen.getByLabelText('Claude is thinking')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('does not show thinking indicator when last message is assistant', () => {
    vi.useFakeTimers()
    const store = makeStore()
    store.dispatch(sessionCreated({ requestId: 'req-1', sessionId: 'sess-1' }))
    store.dispatch(addUserMessage({ sessionId: 'sess-1', text: 'Hello' }))
    store.dispatch(addAssistantMessage({
      sessionId: 'sess-1',
      content: [{ type: 'text', text: 'Hi there' }],
    }))
    // Status is running, but last message is assistant

    const pane: ClaudeChatPaneContent = { ...BASE_PANE, status: 'running' }
    render(
      <Provider store={store}>
        <ClaudeChatView tabId="t1" paneId="p1" paneContent={pane} />
      </Provider>,
    )

    act(() => { vi.advanceTimersByTime(250) })
    expect(screen.queryByLabelText('Claude is thinking')).not.toBeInTheDocument()

    vi.useRealTimers()
  })
})

describe('ClaudeChatView auto-expand', () => {
  afterEach(cleanup)

  it('auto-expands the most recent tool blocks', () => {
    const store = makeStore()
    store.dispatch(sessionCreated({ requestId: 'req-1', sessionId: 'sess-1' }))
    // Create a turn with 5 completed tools
    addTurns(store, 1, 5)

    render(
      <Provider store={store}>
        <ClaudeChatView tabId="t1" paneId="p1" paneContent={BASE_PANE} />
      </Provider>,
    )

    // With RECENT_TOOLS_EXPANDED=3, the last 3 tools should be expanded
    // and the first 2 collapsed. Check for expanded tool blocks via aria-expanded.
    const toolButtons = screen.getAllByRole('button', { name: /tool call/i })
    expect(toolButtons).toHaveLength(5)

    // First 2 should be collapsed (aria-expanded=false)
    expect(toolButtons[0]).toHaveAttribute('aria-expanded', 'false')
    expect(toolButtons[1]).toHaveAttribute('aria-expanded', 'false')

    // Last 3 should be expanded (aria-expanded=true)
    expect(toolButtons[2]).toHaveAttribute('aria-expanded', 'true')
    expect(toolButtons[3]).toHaveAttribute('aria-expanded', 'true')
    expect(toolButtons[4]).toHaveAttribute('aria-expanded', 'true')
  })
})
