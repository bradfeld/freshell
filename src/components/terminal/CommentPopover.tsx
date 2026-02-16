import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addComment, closePopover } from '@/store/commentQueueSlice'
import { OVERLAY_Z } from '@/components/ui/overlay'
import { isMacLike } from '@/lib/utils'

interface CommentPopoverProps {
  paneId: string
}

export function CommentPopover({ paneId }: CommentPopoverProps) {
  const dispatch = useAppDispatch()
  const activePopover = useAppSelector((s) => s.commentQueue?.activePopover ?? null)
  const [commentText, setCommentText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isActive = activePopover?.paneId === paneId

  useEffect(() => {
    if (isActive) {
      setCommentText('')
      // Focus textarea after render
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [isActive])

  const handleSubmit = useCallback(() => {
    if (!activePopover || !commentText.trim()) return
    dispatch(addComment({
      paneId: activePopover.paneId,
      selectedText: activePopover.selectedText,
      comment: commentText.trim(),
      selectionStart: activePopover.selectionStart,
      selectionEnd: activePopover.selectionEnd,
    }))
    setCommentText('')
  }, [dispatch, activePopover, commentText])

  const handleCancel = useCallback(() => {
    dispatch(closePopover())
    setCommentText('')
  }, [dispatch])

  useEffect(() => {
    if (!isActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isActive, handleCancel])

  if (!isActive || !activePopover) return null

  const previewText = activePopover.selectedText.length > 120
    ? activePopover.selectedText.slice(0, 120) + '...'
    : activePopover.selectedText

  return (
    <div className={`comment-popover absolute right-2 top-2 ${OVERLAY_Z.menu}`}>
      <div className="bg-background border border-border rounded-lg shadow-lg w-72 p-3">
        <div className="text-xs text-muted-foreground mb-2 font-medium">Add comment</div>
        <div className="bg-muted rounded px-2 py-1 mb-2 text-xs font-mono text-muted-foreground max-h-16 overflow-y-auto whitespace-pre-wrap break-all">
          {previewText}
        </div>
        <textarea
          ref={textareaRef}
          className="w-full h-20 bg-muted border border-border rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Type your comment..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-muted-foreground">
            {isMacLike() ? '⌘' : 'Ctrl'}+Enter to submit
          </span>
          <div className="flex gap-1.5">
            <button
              className="h-7 px-2.5 text-xs rounded border border-border hover:bg-muted"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              className="h-7 px-2.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={!commentText.trim()}
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
