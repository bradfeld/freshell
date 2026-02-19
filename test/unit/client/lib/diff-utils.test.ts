import { describe, it, expect } from 'vitest'
import {
  computeLineDiffWithWordHighlights,
  extractEditToolArgs,
  extractWriteToolContent,
} from '../../../../src/lib/diff-utils'

describe('computeLineDiffWithWordHighlights', () => {
  it('returns context lines for unchanged content', () => {
    const lines = computeLineDiffWithWordHighlights('hello\nworld', 'hello\nworld')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ type: 'context', text: 'hello', lineNo: '1' })
    expect(lines[1]).toEqual({ type: 'context', text: 'world', lineNo: '2' })
  })

  it('returns added/removed lines for changed content', () => {
    // Use trailing newlines so diffLines can find the common first line
    const lines = computeLineDiffWithWordHighlights('line1\nline2\nline3\n', 'line1\nchanged\nline3\n')
    // context(line1), removed(line2), added(changed), context(line3)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatchObject({ type: 'context', text: 'line1' })
    expect(lines[1]).toMatchObject({ type: 'removed', text: 'line2' })
    expect(lines[2]).toMatchObject({ type: 'added', text: 'changed' })
    expect(lines[3]).toMatchObject({ type: 'context', text: 'line3' })
  })

  it('produces word-level changes for paired added/removed lines', () => {
    const lines = computeLineDiffWithWordHighlights('const foo = 1', 'const bar = 1')
    // Single removed + single added line, both with word-level diffs
    const removed = lines.find(l => l.type === 'removed')
    const added = lines.find(l => l.type === 'added')

    expect(removed).toBeDefined()
    expect(added).toBeDefined()
    expect(removed!.words).toBeDefined()
    expect(added!.words).toBeDefined()

    // The removed line should have 'foo' as a removed word
    const removedWord = removed!.words!.find(w => w.type === 'removed')
    expect(removedWord).toBeDefined()
    expect(removedWord!.value).toBe('foo')

    // The added line should have 'bar' as an added word
    const addedWord = added!.words!.find(w => w.type === 'added')
    expect(addedWord).toBeDefined()
    expect(addedWord!.value).toBe('bar')
  })

  it('handles multi-line diffs with mixed context, adds, and removes', () => {
    const old = 'line1\nline2\nline3\nline4'
    const nu = 'line1\nmodified\nnew-line\nline4'
    const lines = computeLineDiffWithWordHighlights(old, nu)

    // Context, removed(line2), added(modified), removed(line3), added(new-line), context
    const types = lines.map(l => l.type)
    expect(types[0]).toBe('context') // line1
    // line2→modified paired, line3→new-line paired
    expect(types.filter(t => t === 'removed')).toHaveLength(2)
    expect(types.filter(t => t === 'added')).toHaveLength(2)
    expect(types[types.length - 1]).toBe('context') // line4
  })

  it('does not produce word changes for unpaired additions', () => {
    // Append-only change: first two lines are context, last two are purely added
    const lines = computeLineDiffWithWordHighlights('alpha\nbeta\n', 'alpha\nbeta\ngamma\ndelta\n')
    const addedLines = lines.filter(l => l.type === 'added')
    expect(addedLines.length).toBeGreaterThan(0)
    // Unpaired additions (no corresponding removals) should NOT have word-level diffs
    for (const line of addedLines) {
      expect(line.words).toBeUndefined()
    }
  })

  it('handles empty old string (all added)', () => {
    const lines = computeLineDiffWithWordHighlights('', 'new content')
    expect(lines).toHaveLength(1)
    expect(lines[0].type).toBe('added')
    expect(lines[0].text).toBe('new content')
  })

  it('handles empty new string (all removed)', () => {
    const lines = computeLineDiffWithWordHighlights('old content', '')
    expect(lines).toHaveLength(1)
    expect(lines[0].type).toBe('removed')
    expect(lines[0].text).toBe('old content')
  })

  it('handles both strings empty', () => {
    const lines = computeLineDiffWithWordHighlights('', '')
    // diffLines with two empty strings produces no hunks
    expect(lines).toHaveLength(0)
  })
})

describe('extractEditToolArgs', () => {
  it('returns parsed args from object input', () => {
    const result = extractEditToolArgs({
      old_string: 'const a = 1',
      new_string: 'const b = 1',
      file_path: '/tmp/test.ts',
    })
    expect(result).toEqual({
      oldStr: 'const a = 1',
      newStr: 'const b = 1',
      filePath: '/tmp/test.ts',
    })
  })

  it('returns parsed args from JSON string input', () => {
    const json = JSON.stringify({
      old_string: 'hello',
      new_string: 'world',
      file_path: '/tmp/file.txt',
    })
    const result = extractEditToolArgs(json)
    expect(result).toEqual({
      oldStr: 'hello',
      newStr: 'world',
      filePath: '/tmp/file.txt',
    })
  })

  it('returns result without filePath when file_path is missing', () => {
    const result = extractEditToolArgs({
      old_string: 'a',
      new_string: 'b',
    })
    expect(result).toEqual({
      oldStr: 'a',
      newStr: 'b',
      filePath: undefined,
    })
  })

  it('returns null for missing old_string', () => {
    expect(extractEditToolArgs({ new_string: 'b' })).toBeNull()
  })

  it('returns null for non-string old_string', () => {
    expect(extractEditToolArgs({ old_string: 123, new_string: 'b' })).toBeNull()
  })

  it('returns null for null input', () => {
    expect(extractEditToolArgs(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(extractEditToolArgs(undefined)).toBeNull()
  })

  it('returns null for array input', () => {
    expect(extractEditToolArgs([1, 2, 3])).toBeNull()
  })

  it('returns null for invalid JSON string', () => {
    expect(extractEditToolArgs('not-json')).toBeNull()
  })
})

describe('extractWriteToolContent', () => {
  it('returns parsed content from object input', () => {
    const result = extractWriteToolContent({
      content: 'file contents here',
      file_path: '/tmp/new-file.ts',
    })
    expect(result).toEqual({
      content: 'file contents here',
      filePath: '/tmp/new-file.ts',
    })
  })

  it('returns parsed content from JSON string input', () => {
    const json = JSON.stringify({
      content: 'hello world',
      file_path: '/tmp/file.txt',
    })
    const result = extractWriteToolContent(json)
    expect(result).toEqual({
      content: 'hello world',
      filePath: '/tmp/file.txt',
    })
  })

  it('returns result without filePath when file_path is missing', () => {
    const result = extractWriteToolContent({ content: 'stuff' })
    expect(result).toEqual({
      content: 'stuff',
      filePath: undefined,
    })
  })

  it('returns null for missing content', () => {
    expect(extractWriteToolContent({ file_path: '/tmp/f.txt' })).toBeNull()
  })

  it('returns null for null input', () => {
    expect(extractWriteToolContent(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(extractWriteToolContent(undefined)).toBeNull()
  })
})
