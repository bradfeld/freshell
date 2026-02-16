import { describe, it, expect } from 'vitest'
import { formatCommentAsPrompt, formatBatchedComments } from '@/lib/comment-formatter'
import type { InlineComment } from '@/store/commentQueueTypes'

function makeComment(overrides: Partial<InlineComment> = {}): InlineComment {
  return {
    id: 'test-id',
    paneId: 'pane-1',
    selectedText: 'selected text',
    comment: 'my comment',
    createdAt: Date.now(),
    selectionStart: null,
    selectionEnd: null,
    ...overrides,
  }
}

describe('formatCommentAsPrompt', () => {
  it('formats selected text and comment with blank line separator', () => {
    const result = formatCommentAsPrompt(makeComment())
    expect(result).toBe('selected text\n\nmy comment\n')
  })

  it('preserves special characters in selection and comment', () => {
    const result = formatCommentAsPrompt(
      makeComment({
        selectedText: 'const x = "hello";\nconst y = `${x}`;',
        comment: 'Why use template literal here?',
      })
    )
    expect(result).toContain('const x = "hello";\nconst y = `${x}`;')
    expect(result).toContain('Why use template literal here?')
  })

  it('truncates selection over 2000 chars', () => {
    const longText = 'a'.repeat(2500)
    const result = formatCommentAsPrompt(makeComment({ selectedText: longText }))
    expect(result).toContain('[...truncated]')
    // Selection portion should be 2000 chars + truncation marker
    expect(result.length).toBeLessThan(2500 + 100)
  })

  it('does not truncate selection at exactly 2000 chars', () => {
    const exactText = 'b'.repeat(2000)
    const result = formatCommentAsPrompt(makeComment({ selectedText: exactText }))
    expect(result).not.toContain('[...truncated]')
  })

  it('ends with a trailing newline', () => {
    const result = formatCommentAsPrompt(makeComment())
    expect(result.endsWith('\n')).toBe(true)
  })
})

describe('formatBatchedComments', () => {
  it('returns empty string for empty array', () => {
    expect(formatBatchedComments([])).toBe('')
  })

  it('formats single comment without separator', () => {
    const result = formatBatchedComments([makeComment()])
    expect(result).toBe('selected text\n\nmy comment\n')
    expect(result).not.toContain('---')
  })

  it('separates multiple comments with ---', () => {
    const comments = [
      makeComment({ selectedText: 'first', comment: 'comment 1' }),
      makeComment({ selectedText: 'second', comment: 'comment 2' }),
    ]
    const result = formatBatchedComments(comments)
    expect(result).toContain('first\n\ncomment 1\n')
    expect(result).toContain('\n---\n')
    expect(result).toContain('second\n\ncomment 2\n')
  })

  it('handles three comments with two separators', () => {
    const comments = [
      makeComment({ selectedText: 'a', comment: '1' }),
      makeComment({ selectedText: 'b', comment: '2' }),
      makeComment({ selectedText: 'c', comment: '3' }),
    ]
    const result = formatBatchedComments(comments)
    const separators = result.match(/\n---\n/g)
    expect(separators).toHaveLength(2)
  })

  it('ends with trailing newline for batched comments', () => {
    const comments = [
      makeComment({ selectedText: 'a', comment: '1' }),
      makeComment({ selectedText: 'b', comment: '2' }),
    ]
    const result = formatBatchedComments(comments)
    expect(result.endsWith('\n')).toBe(true)
  })
})
