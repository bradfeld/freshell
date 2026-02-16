import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import commentQueueReducer, { addComment, flushQueue } from '@/store/commentQueueSlice'
import { useCommentQueue } from '@/hooks/useCommentQueue'
import type { InlineComment } from '@/store/commentQueueTypes'

const formatCommentAsPrompt = vi.hoisted(() => vi.fn())
const formatBatchedComments = vi.hoisted(() => vi.fn())

vi.mock('@/lib/comment-formatter', () => ({
  formatCommentAsPrompt,
  formatBatchedComments,
}))

vi.mock('nanoid', () => ({ nanoid: () => 'test-id' }))

// Minimal turnCompletion slice for testing (must include seq for watermark pattern)
let nextSeq = 1
const turnCompletionSlice = createSlice({
  name: 'turnCompletion',
  initialState: { pendingEvents: [] as Array<{ paneId: string; seq: number }> },
  reducers: {
    addEvent: {
      reducer(state, action: PayloadAction<{ paneId: string; seq: number }>) {
        state.pendingEvents.push(action.payload)
      },
      prepare(payload: { paneId: string }) {
        return { payload: { ...payload, seq: nextSeq++ } }
      },
    },
    clearEvents(state) {
      state.pendingEvents = []
    },
  },
})

const { addEvent, clearEvents } = turnCompletionSlice.actions

function TestComponent({
  paneId,
  mode,
  sendInput,
}: {
  paneId: string
  mode: string | undefined
  sendInput: (data: string) => void
}) {
  useCommentQueue({ paneId, mode, sendInput })
  return null
}

function createStore() {
  return configureStore({
    reducer: {
      commentQueue: commentQueueReducer,
      turnCompletion: turnCompletionSlice.reducer,
    },
    preloadedState: {
      commentQueue: {
        queueByPane: {},
        activePopover: null,
      },
      turnCompletion: {
        pendingEvents: [],
      },
    },
  })
}

describe('useCommentQueue', () => {
  const sendInput = vi.fn()

  beforeEach(() => {
    nextSeq = 1
    sendInput.mockClear()
    formatCommentAsPrompt.mockClear()
    formatBatchedComments.mockClear()

    // Mock implementations
    formatCommentAsPrompt.mockImplementation((c: InlineComment) => `[${c.comment}]`)
    formatBatchedComments.mockImplementation((cs: InlineComment[]) =>
      cs.map((c) => `[${c.comment}]`).join('\n'),
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('sends comment immediately in shell mode when added to queue', () => {
    const store = createStore()

    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="shell" sendInput={sendInput} />
      </Provider>,
    )

    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'Fix this',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
    })

    expect(formatCommentAsPrompt).toHaveBeenCalledTimes(1)
    expect(formatCommentAsPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: 'Fix this',
        selectedText: 'const x = 1;',
      }),
    )
    expect(sendInput).toHaveBeenCalledWith('[Fix this]')
  })

  it('flushes queue after sending in shell mode', () => {
    const store = createStore()

    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="shell" sendInput={sendInput} />
      </Provider>,
    )

    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'Fix this',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
    })

    const state = store.getState()
    expect(state.commentQueue.queueByPane['pane-1']).toBeUndefined()
  })

  it('does NOT send immediately in non-shell mode when comment added', () => {
    const store = createStore()

    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="coding-cli" sendInput={sendInput} />
      </Provider>,
    )

    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'Fix this',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
    })

    expect(sendInput).not.toHaveBeenCalled()

    const state = store.getState()
    expect(state.commentQueue.queueByPane['pane-1']).toHaveLength(1)
  })

  it('sends all comments in non-shell mode when turn-complete event fires for matching pane', () => {
    const store = createStore()

    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="coding-cli" sendInput={sendInput} />
      </Provider>,
    )

    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'First comment',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const y = 2;',
          comment: 'Second comment',
          selectionStart: { row: 1, col: 0 },
          selectionEnd: { row: 1, col: 12 },
        }),
      )
    })

    expect(sendInput).not.toHaveBeenCalled()

    act(() => {
      store.dispatch(addEvent({ paneId: 'pane-1' }))
    })

    expect(formatBatchedComments).toHaveBeenCalledTimes(1)
    expect(formatBatchedComments).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ comment: 'First comment' }),
        expect.objectContaining({ comment: 'Second comment' }),
      ]),
    )
    expect(sendInput).toHaveBeenCalledWith('[First comment]\n[Second comment]')

    const state = store.getState()
    expect(state.commentQueue.queueByPane['pane-1']).toBeUndefined()
  })

  it('does NOT send in non-shell mode when turn-complete fires for different pane', () => {
    const store = createStore()

    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="coding-cli" sendInput={sendInput} />
      </Provider>,
    )

    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'Fix this',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
    })

    act(() => {
      store.dispatch(addEvent({ paneId: 'pane-2' }))
    })

    expect(sendInput).not.toHaveBeenCalled()

    const state = store.getState()
    expect(state.commentQueue.queueByPane['pane-1']).toHaveLength(1)
  })

  it('does nothing in non-shell mode when queue is empty on turn-complete', () => {
    const store = createStore()

    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="coding-cli" sendInput={sendInput} />
      </Provider>,
    )

    act(() => {
      store.dispatch(addEvent({ paneId: 'pane-1' }))
    })

    expect(formatBatchedComments).not.toHaveBeenCalled()
    expect(sendInput).not.toHaveBeenCalled()
  })

  it('handles multiple comments added before shell mode send', () => {
    const store = createStore()

    // Add first comment
    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'First',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
    })

    // Render with shell mode - should send the first comment
    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="shell" sendInput={sendInput} />
      </Provider>,
    )

    expect(sendInput).toHaveBeenCalledTimes(1)
    expect(sendInput).toHaveBeenCalledWith('[First]')
  })

  it('uses refs to capture latest sendInput callback', () => {
    const store = createStore()
    const sendInput1 = vi.fn()
    const sendInput2 = vi.fn()

    formatCommentAsPrompt.mockImplementation((c: InlineComment) => `[${c.comment}]`)

    const { rerender } = render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="shell" sendInput={sendInput1} />
      </Provider>,
    )

    rerender(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="shell" sendInput={sendInput2} />
      </Provider>,
    )

    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'Test',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
    })

    expect(sendInput1).not.toHaveBeenCalled()
    expect(sendInput2).toHaveBeenCalledWith('[Test]')
  })

  it('handles empty formatted batch gracefully', () => {
    const store = createStore()

    formatBatchedComments.mockReturnValue('')

    render(
      <Provider store={store}>
        <TestComponent paneId="pane-1" mode="coding-cli" sendInput={sendInput} />
      </Provider>,
    )

    act(() => {
      store.dispatch(
        addComment({
          paneId: 'pane-1',
          selectedText: 'const x = 1;',
          comment: 'Test',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 12 },
        }),
      )
    })

    act(() => {
      store.dispatch(addEvent({ paneId: 'pane-1' }))
    })

    expect(sendInput).not.toHaveBeenCalled()

    const state = store.getState()
    expect(state.commentQueue.queueByPane['pane-1']).toBeUndefined()
  })
})
