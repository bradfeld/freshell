export interface InlineComment {
  id: string
  paneId: string
  selectedText: string
  comment: string
  createdAt: number
  selectionStart: { row: number; col: number } | null
  selectionEnd: { row: number; col: number } | null
}

export interface ActivePopover {
  paneId: string
  selectedText: string
  selectionStart: { row: number; col: number } | null
  selectionEnd: { row: number; col: number } | null
}

export interface CommentQueueState {
  queueByPane: Record<string, InlineComment[]>
  activePopover: ActivePopover | null
}
