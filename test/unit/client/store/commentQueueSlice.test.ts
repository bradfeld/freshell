import { describe, it, expect, vi } from 'vitest'
import reducer, {
  openPopover,
  closePopover,
  addComment,
  removeComment,
  flushQueue,
  clearPaneComments,
} from '@/store/commentQueueSlice'
import type { CommentQueueState } from '@/store/commentQueueTypes'

vi.mock('nanoid', () => ({ nanoid: () => 'mock-id-1' }))

const emptyState: CommentQueueState = {
  queueByPane: {},
  activePopover: null,
}

describe('commentQueueSlice', () => {
  describe('openPopover / closePopover', () => {
    it('opens a popover with selection context', () => {
      const state = reducer(
        undefined,
        openPopover({
          paneId: 'pane-1',
          selectedText: 'hello world',
          selectionStart: { row: 0, col: 0 },
          selectionEnd: { row: 0, col: 10 },
        })
      )

      expect(state.activePopover).toEqual({
        paneId: 'pane-1',
        selectedText: 'hello world',
        selectionStart: { row: 0, col: 0 },
        selectionEnd: { row: 0, col: 10 },
      })
    })

    it('closes the popover', () => {
      let state = reducer(
        undefined,
        openPopover({
          paneId: 'pane-1',
          selectedText: 'text',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(state, closePopover())
      expect(state.activePopover).toBeNull()
    })
  })

  describe('addComment', () => {
    it('adds a comment to the specified pane queue', () => {
      const state = reducer(
        undefined,
        addComment({
          paneId: 'pane-1',
          selectedText: 'selected',
          comment: 'my comment',
          selectionStart: { row: 1, col: 5 },
          selectionEnd: { row: 1, col: 13 },
        })
      )

      expect(state.queueByPane['pane-1']).toHaveLength(1)
      const comment = state.queueByPane['pane-1'][0]
      expect(comment.id).toBe('mock-id-1')
      expect(comment.paneId).toBe('pane-1')
      expect(comment.selectedText).toBe('selected')
      expect(comment.comment).toBe('my comment')
      expect(comment.createdAt).toBeGreaterThan(0)
    })

    it('closes the active popover after adding', () => {
      let state = reducer(
        undefined,
        openPopover({
          paneId: 'pane-1',
          selectedText: 'text',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(
        state,
        addComment({
          paneId: 'pane-1',
          selectedText: 'text',
          comment: 'note',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      expect(state.activePopover).toBeNull()
    })

    it('supports multiple comments per pane', () => {
      let state = reducer(
        undefined,
        addComment({
          paneId: 'pane-1',
          selectedText: 'first',
          comment: 'comment 1',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(
        state,
        addComment({
          paneId: 'pane-1',
          selectedText: 'second',
          comment: 'comment 2',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      expect(state.queueByPane['pane-1']).toHaveLength(2)
    })
  })

  describe('removeComment', () => {
    it('removes a specific comment by id', () => {
      let state = reducer(
        undefined,
        addComment({
          paneId: 'pane-1',
          selectedText: 'text',
          comment: 'to remove',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      const commentId = state.queueByPane['pane-1'][0].id
      state = reducer(state, removeComment({ paneId: 'pane-1', commentId }))
      expect(state.queueByPane['pane-1']).toBeUndefined()
    })

    it('is a no-op for non-existent pane', () => {
      const state = reducer(emptyState, removeComment({ paneId: 'pane-99', commentId: 'nope' }))
      expect(state.queueByPane).toEqual({})
    })
  })

  describe('flushQueue', () => {
    it('removes all comments for a pane', () => {
      let state = reducer(
        undefined,
        addComment({
          paneId: 'pane-1',
          selectedText: 'a',
          comment: 'b',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(
        state,
        addComment({
          paneId: 'pane-1',
          selectedText: 'c',
          comment: 'd',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(state, flushQueue({ paneId: 'pane-1' }))
      expect(state.queueByPane['pane-1']).toBeUndefined()
    })

    it('does not affect other panes', () => {
      let state = reducer(
        undefined,
        addComment({
          paneId: 'pane-1',
          selectedText: 'a',
          comment: 'b',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(
        state,
        addComment({
          paneId: 'pane-2',
          selectedText: 'c',
          comment: 'd',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(state, flushQueue({ paneId: 'pane-1' }))
      expect(state.queueByPane['pane-1']).toBeUndefined()
      expect(state.queueByPane['pane-2']).toHaveLength(1)
    })
  })

  describe('clearPaneComments', () => {
    it('clears queue and popover for the pane', () => {
      let state = reducer(
        undefined,
        openPopover({
          paneId: 'pane-1',
          selectedText: 'text',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(
        state,
        addComment({
          paneId: 'pane-1',
          selectedText: 'a',
          comment: 'b',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(state, clearPaneComments({ paneId: 'pane-1' }))
      expect(state.queueByPane['pane-1']).toBeUndefined()
      expect(state.activePopover).toBeNull()
    })

    it('does not clear popover if it belongs to a different pane', () => {
      let state = reducer(
        undefined,
        openPopover({
          paneId: 'pane-2',
          selectedText: 'text',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(state, clearPaneComments({ paneId: 'pane-1' }))
      expect(state.activePopover?.paneId).toBe('pane-2')
    })
  })

  describe('multi-pane independence', () => {
    it('maintains separate queues per pane', () => {
      let state = reducer(
        undefined,
        addComment({
          paneId: 'pane-1',
          selectedText: 'a',
          comment: 'b',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      state = reducer(
        state,
        addComment({
          paneId: 'pane-2',
          selectedText: 'c',
          comment: 'd',
          selectionStart: null,
          selectionEnd: null,
        })
      )
      expect(state.queueByPane['pane-1']).toHaveLength(1)
      expect(state.queueByPane['pane-2']).toHaveLength(1)
      expect(state.queueByPane['pane-1'][0].selectedText).toBe('a')
      expect(state.queueByPane['pane-2'][0].selectedText).toBe('c')
    })
  })
})
