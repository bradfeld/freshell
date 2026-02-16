import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { flushQueue } from '@/store/commentQueueSlice'
import { formatCommentAsPrompt, formatBatchedComments } from '@/lib/comment-formatter'
import type { TurnCompleteEvent } from '@/store/turnCompletionSlice'

const EMPTY_EVENTS: TurnCompleteEvent[] = []

interface UseCommentQueueOptions {
  paneId: string
  mode: string | undefined
  sendInput: (data: string) => void
}

/**
 * Connects the comment queue to turn-complete signals.
 * - In coding CLI mode: waits for turn-complete, then flushes all pending comments as a batched prompt.
 * - In shell mode: sends comments immediately when added (no batching).
 */
export function useCommentQueue({ paneId, mode, sendInput }: UseCommentQueueOptions) {
  const dispatch = useAppDispatch()
  const comments = useAppSelector((s) => s.commentQueue?.queueByPane[paneId])
  const pendingEvents = useAppSelector((s) => s.turnCompletion?.pendingEvents ?? EMPTY_EVENTS)

  // Use refs to avoid stale closures in the effect
  const commentsRef = useRef(comments)
  commentsRef.current = comments

  const sendInputRef = useRef(sendInput)
  sendInputRef.current = sendInput

  // Shell mode: send ALL new comments immediately when they're added
  const prevCommentCountRef = useRef(0)
  useEffect(() => {
    if (mode !== 'shell') {
      prevCommentCountRef.current = comments?.length ?? 0
      return
    }

    const currentCount = comments?.length ?? 0
    if (currentCount > prevCommentCountRef.current && comments) {
      // Send every comment added since the last render (handles batched dispatches)
      for (let i = prevCommentCountRef.current; i < currentCount; i++) {
        const formatted = formatCommentAsPrompt(comments[i])
        sendInputRef.current(formatted)
      }
      dispatch(flushQueue({ paneId }))
    }
    prevCommentCountRef.current = currentCount
  }, [comments, mode, paneId, dispatch])

  // Coding CLI mode: flush on turn-complete using seq watermark
  // Uses the same pattern as useTurnCompletionNotifications — tracks a lastHandledSeqRef
  // so this hook processes events independently of other consumers.
  const lastHandledSeqRef = useRef(0)
  useEffect(() => {
    if (mode === 'shell') return
    if (pendingEvents.length === 0) return

    const currentComments = commentsRef.current
    if (!currentComments || currentComments.length === 0) return

    // Find unhandled events matching this pane
    let foundMatch = false
    for (const event of pendingEvents) {
      if (event.seq <= lastHandledSeqRef.current) continue
      lastHandledSeqRef.current = event.seq
      if (event.paneId === paneId) {
        foundMatch = true
      }
    }

    if (!foundMatch) return

    // Flush all pending comments for this pane
    const formatted = formatBatchedComments(currentComments)
    if (formatted) {
      sendInputRef.current(formatted)
    }
    dispatch(flushQueue({ paneId }))
  }, [pendingEvents, mode, paneId, dispatch])
}
