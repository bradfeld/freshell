import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { CommentPopover } from '@/components/terminal/CommentPopover'
import commentQueueReducer from '@/store/commentQueueSlice'
import type { CommentQueueState } from '@/store/commentQueueTypes'

vi.mock('nanoid', () => ({ nanoid: () => 'test-id' }))
vi.mock('@/components/ui/overlay', () => ({ OVERLAY_Z: { menu: 'z-50' } }))

function createTestStore(preloadedState?: { commentQueue: CommentQueueState }) {
  return configureStore({
    reducer: {
      commentQueue: commentQueueReducer,
    },
    preloadedState,
  })
}

function renderWithStore(ui: React.ReactElement, preloadedState?: { commentQueue: CommentQueueState }) {
  const store = createTestStore(preloadedState)
  return {
    ...render(<Provider store={store}>{ui}</Provider>),
    store,
  }
}

describe('CommentPopover', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not render when activePopover is null', () => {
    renderWithStore(<CommentPopover paneId="test-pane" />)

    expect(screen.queryByText('Add comment')).not.toBeInTheDocument()
  })

  it('does not render when activePopover belongs to different pane', () => {
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'other-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    expect(screen.queryByText('Add comment')).not.toBeInTheDocument()
  })

  it('renders when activePopover matches paneId — shows heading and selection preview', () => {
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    expect(screen.getByText('Add comment')).toBeInTheDocument()
    expect(screen.getByText('selected text')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type your comment...')).toBeInTheDocument()
  })

  it('truncates selection preview longer than 120 chars with "..."', () => {
    const longText = 'a'.repeat(150)
    const expectedPreview = 'a'.repeat(120) + '...'

    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: longText,
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 150 },
        },
      },
    }

    renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    expect(screen.getByText(expectedPreview)).toBeInTheDocument()
    expect(screen.queryByText(longText)).not.toBeInTheDocument()
  })

  it('submit button is disabled when textarea is empty', () => {
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const submitButton = screen.getByRole('button', { name: /submit/i })
    expect(submitButton).toBeDisabled()
  })

  it('submit button is enabled after typing', async () => {
    const user = userEvent.setup()
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const textarea = screen.getByPlaceholderText('Type your comment...')
    await user.type(textarea, 'my comment')

    const submitButton = screen.getByRole('button', { name: /submit/i })
    expect(submitButton).not.toBeDisabled()
  })

  it('clicking Submit dispatches addComment with correct payload and clears text', async () => {
    const user = userEvent.setup()
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 1, col: 5 },
          selectionEnd: { row: 2, col: 10 },
        },
      },
    }

    const { store } = renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const textarea = screen.getByPlaceholderText('Type your comment...')
    await user.type(textarea, 'my comment')

    const submitButton = screen.getByRole('button', { name: /submit/i })
    await user.click(submitButton)

    const state = store.getState()
    expect(state.commentQueue.queueByPane['test-pane']).toHaveLength(1)
    expect(state.commentQueue.queueByPane['test-pane'][0]).toMatchObject({
      id: 'test-id',
      paneId: 'test-pane',
      selectedText: 'selected text',
      comment: 'my comment',
      selectionStart: { row: 1, col: 5 },
      selectionEnd: { row: 2, col: 10 },
    })
    expect(state.commentQueue.activePopover).toBeNull()

    // Popover should be unmounted (activePopover is null after addComment)
    expect(screen.queryByPlaceholderText('Type your comment...')).not.toBeInTheDocument()
  })

  it('clicking Cancel dispatches closePopover and clears text', async () => {
    const user = userEvent.setup()
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    const { store } = renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const textarea = screen.getByPlaceholderText('Type your comment...')
    await user.type(textarea, 'my comment')

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    const state = store.getState()
    expect(state.commentQueue.activePopover).toBeNull()
    expect(state.commentQueue.queueByPane['test-pane']).toBeUndefined()
  })

  it('Escape key dispatches closePopover', async () => {
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    const { store } = renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    fireEvent.keyDown(document, { key: 'Escape' })

    const state = store.getState()
    expect(state.commentQueue.activePopover).toBeNull()
  })

  it('Ctrl+Enter submits comment', async () => {
    const user = userEvent.setup()
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    const { store } = renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const textarea = screen.getByPlaceholderText('Type your comment...')
    await user.type(textarea, 'my comment')

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    const state = store.getState()
    expect(state.commentQueue.queueByPane['test-pane']).toHaveLength(1)
    expect(state.commentQueue.queueByPane['test-pane'][0].comment).toBe('my comment')
    expect(state.commentQueue.activePopover).toBeNull()
  })

  it('Cmd+Enter submits comment on Mac', async () => {
    const user = userEvent.setup()
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    const { store } = renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const textarea = screen.getByPlaceholderText('Type your comment...')
    await user.type(textarea, 'my comment')

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    const state = store.getState()
    expect(state.commentQueue.queueByPane['test-pane']).toHaveLength(1)
    expect(state.commentQueue.queueByPane['test-pane'][0].comment).toBe('my comment')
    expect(state.commentQueue.activePopover).toBeNull()
  })

  it('does not submit empty or whitespace-only comments', async () => {
    const user = userEvent.setup()
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    const { store } = renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const textarea = screen.getByPlaceholderText('Type your comment...')
    await user.type(textarea, '   ')

    const submitButton = screen.getByRole('button', { name: /submit/i })
    expect(submitButton).toBeDisabled()

    await user.click(submitButton)

    const state = store.getState()
    expect(state.commentQueue.queueByPane['test-pane']).toBeUndefined()
  })

  it('trims whitespace from comment before submitting', async () => {
    const user = userEvent.setup()
    const preloadedState = {
      commentQueue: {
        queueByPane: {},
        activePopover: {
          paneId: 'test-pane',
          selectedText: 'selected text',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 13 },
        },
      },
    }

    const { store } = renderWithStore(<CommentPopover paneId="test-pane" />, preloadedState)

    const textarea = screen.getByPlaceholderText('Type your comment...')
    await user.type(textarea, '  my comment  ')

    const submitButton = screen.getByRole('button', { name: /submit/i })
    await user.click(submitButton)

    const state = store.getState()
    expect(state.commentQueue.queueByPane['test-pane'][0].comment).toBe('my comment')
  })
})
