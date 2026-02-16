import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { nanoid } from 'nanoid'
import type { CommentQueueState, ActivePopover } from './commentQueueTypes'

const initialState: CommentQueueState = {
  queueByPane: {},
  activePopover: null,
}

type AddCommentPayload = {
  paneId: string
  selectedText: string
  comment: string
  selectionStart: { row: number; col: number } | null
  selectionEnd: { row: number; col: number } | null
}

const commentQueueSlice = createSlice({
  name: 'commentQueue',
  initialState,
  reducers: {
    openPopover(state, action: PayloadAction<ActivePopover>) {
      state.activePopover = action.payload
    },
    closePopover(state) {
      state.activePopover = null
    },
    addComment: {
      reducer(state, action: PayloadAction<AddCommentPayload & { id: string; createdAt: number }>) {
        const { paneId, id, selectedText, comment, createdAt, selectionStart, selectionEnd } = action.payload
        if (!state.queueByPane[paneId]) {
          state.queueByPane[paneId] = []
        }
        state.queueByPane[paneId].push({
          id,
          paneId,
          selectedText,
          comment,
          createdAt,
          selectionStart,
          selectionEnd,
        })
        state.activePopover = null
      },
      prepare(payload: AddCommentPayload) {
        return {
          payload: {
            ...payload,
            id: nanoid(),
            createdAt: Date.now(),
          },
        }
      },
    },
    removeComment(state, action: PayloadAction<{ paneId: string; commentId: string }>) {
      const { paneId, commentId } = action.payload
      const queue = state.queueByPane[paneId]
      if (!queue) return
      state.queueByPane[paneId] = queue.filter((c) => c.id !== commentId)
      if (state.queueByPane[paneId].length === 0) {
        delete state.queueByPane[paneId]
      }
    },
    flushQueue(state, action: PayloadAction<{ paneId: string }>) {
      const { paneId } = action.payload
      delete state.queueByPane[paneId]
    },
    clearPaneComments(state, action: PayloadAction<{ paneId: string }>) {
      delete state.queueByPane[action.payload.paneId]
      if (state.activePopover?.paneId === action.payload.paneId) {
        state.activePopover = null
      }
    },
  },
})

export const {
  openPopover,
  closePopover,
  addComment,
  removeComment,
  flushQueue,
  clearPaneComments,
} = commentQueueSlice.actions

export default commentQueueSlice.reducer
