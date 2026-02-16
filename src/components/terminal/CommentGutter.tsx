import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { removeComment } from '@/store/commentQueueSlice'
import { OVERLAY_Z } from '@/components/ui/overlay'
import { MessageSquare, X } from 'lucide-react'

interface CommentGutterProps {
  paneId: string
}

export function CommentGutter({ paneId }: CommentGutterProps) {
  const dispatch = useAppDispatch()
  const comments = useAppSelector((s) => s.commentQueue?.queueByPane[paneId] ?? [])
  const [isExpanded, setIsExpanded] = useState(false)

  if (comments.length === 0) return null

  return (
    <div className={`comment-gutter absolute left-2 bottom-2 ${OVERLAY_Z.menu}`}>
      <button
        className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-2.5 py-1 text-xs font-medium shadow-md hover:bg-primary/90 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        title={`${comments.length} pending comment${comments.length > 1 ? 's' : ''}`}
      >
        <MessageSquare className="h-3 w-3" />
        <span>{comments.length}</span>
      </button>

      {isExpanded && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border">
            Pending comments ({comments.length})
          </div>
          {comments.map((comment) => (
            <div key={comment.id} className="p-2 border-b border-border last:border-b-0 group">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {comment.selectedText.slice(0, 50)}
                    {comment.selectedText.length > 50 ? '...' : ''}
                  </div>
                  <div className="text-xs mt-0.5 text-foreground">{comment.comment}</div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    dispatch(removeComment({ paneId, commentId: comment.id }))
                  }}
                  title="Remove comment"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
