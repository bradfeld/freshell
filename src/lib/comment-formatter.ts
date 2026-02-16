import type { InlineComment } from '@/store/commentQueueTypes'

const MAX_SELECTION_LENGTH = 2000
const TRUNCATION_MARKER = '\n[...truncated]'

function truncateSelection(text: string): string {
  if (text.length <= MAX_SELECTION_LENGTH) return text
  return text.slice(0, MAX_SELECTION_LENGTH) + TRUNCATION_MARKER
}

/**
 * Format a single comment as a prompt to send to the PTY.
 * Format: selected text, blank line, then the comment.
 */
export function formatCommentAsPrompt(comment: InlineComment): string {
  const selection = truncateSelection(comment.selectedText)
  return `${selection}\n\n${comment.comment}\n`
}

/**
 * Format multiple comments as a single batched prompt.
 * Each comment is separated by a --- divider.
 */
export function formatBatchedComments(comments: InlineComment[]): string {
  if (comments.length === 0) return ''
  if (comments.length === 1) return formatCommentAsPrompt(comments[0])
  return comments.map(formatCommentAsPrompt).join('\n---\n') + '\n'
}
