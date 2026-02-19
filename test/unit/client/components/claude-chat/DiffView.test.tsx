import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DiffView from '../../../../../src/components/claude-chat/DiffView'

describe('DiffView', () => {
  afterEach(cleanup)

  it('renders removed and added lines', () => {
    const { container } = render(
      <DiffView oldStr="const foo = 1" newStr="const bar = 1" />
    )
    // Should show removed line with - prefix or red styling
    expect(container.textContent).toContain('foo')
    expect(container.textContent).toContain('bar')
  })

  it('renders with line numbers and diff prefixes', () => {
    const oldStr = ['line1', 'line2', 'line3'].join('\n')
    const newStr = ['line1', 'changed', 'line3'].join('\n')
    render(<DiffView oldStr={oldStr} newStr={newStr} />)

    const figure = screen.getByRole('figure', { name: /diff/i })

    // DiffView renders each diff line as div.flex > [span(lineNo), span(prefix), span(text)].
    // For this diff: context(line1), removed(line2), added(changed), context(line3) = 4 line divs.
    // Each line div has exactly 3 child spans.
    const lineDivs = Array.from(figure.querySelectorAll('.leading-relaxed > div'))
    expect(lineDivs).toHaveLength(4)

    // Extract line numbers and prefixes from each line div
    const parsed = lineDivs.map(div => {
      const spans = div.querySelectorAll('span')
      return {
        lineNo: spans[0]?.textContent?.trim(),
        prefix: spans[1]?.textContent?.trim(),
        text: spans[2]?.textContent?.trim(),
      }
    })

    // Context line1: line 1, space prefix
    expect(parsed[0]).toEqual({ lineNo: '1', prefix: '', text: 'line1' })
    // Removed line2: old line 2, minus prefix
    expect(parsed[1]).toEqual({ lineNo: '2', prefix: '−', text: 'line2' })
    // Added changed: new line 2, plus prefix
    expect(parsed[2]).toEqual({ lineNo: '2', prefix: '+', text: 'changed' })
    // Context line3: line 3, space prefix
    expect(parsed[3]).toEqual({ lineNo: '3', prefix: '', text: 'line3' })
  })

  it('shows no-changes message when strings are identical', () => {
    render(<DiffView oldStr="same" newStr="same" />)
    expect(screen.getByText(/no changes/i)).toBeInTheDocument()
  })

  it('uses semantic role', () => {
    render(<DiffView oldStr="a" newStr="b" />)
    expect(screen.getByRole('figure', { name: /diff/i })).toBeInTheDocument()
  })

  // --- data-* attribute tests for context menu ---

  it('tags diff container with data-diff and data-file-path', () => {
    const oldStr = ['line1', 'line2'].join('\n')
    const newStr = ['line1', 'changed'].join('\n')
    render(<DiffView oldStr={oldStr} newStr={newStr} filePath="/tmp/test.ts" />)
    const diffEl = document.querySelector('[data-diff]')
    expect(diffEl).not.toBeNull()
    expect(diffEl?.getAttribute('data-file-path')).toBe('/tmp/test.ts')
  })

  // --- word-level highlighting tests ---

  it('renders word-level highlights within changed lines', () => {
    // "foo" → "bar" should produce word-level highlights
    render(<DiffView oldStr="const foo = 1" newStr="const bar = 1" />)
    const figure = screen.getByRole('figure', { name: /diff/i })

    // Word-level change spans get data-word-change attribute
    const wordSpans = figure.querySelectorAll('[data-word-change]')
    expect(wordSpans.length).toBeGreaterThan(0)

    const removedWords = figure.querySelectorAll('[data-word-change="removed"]')
    const addedWords = figure.querySelectorAll('[data-word-change="added"]')
    expect(removedWords.length).toBeGreaterThan(0)
    expect(addedWords.length).toBeGreaterThan(0)

    // "foo" should be in a removed word span, "bar" in an added word span
    const removedTexts = Array.from(removedWords).map(el => el.textContent)
    const addedTexts = Array.from(addedWords).map(el => el.textContent)
    expect(removedTexts.some(t => t?.includes('foo'))).toBe(true)
    expect(addedTexts.some(t => t?.includes('bar'))).toBe(true)
  })

  it('word highlights not applied to unpaired additions', () => {
    // Pure addition (no corresponding removal) — no word-level diffs
    render(<DiffView oldStr="" newStr="brand new line" />)
    const figure = screen.getByRole('figure', { name: /diff/i })

    // Should NOT have any word-change highlights (no pairing possible)
    const wordSpans = figure.querySelectorAll('[data-word-change]')
    expect(wordSpans).toHaveLength(0)
  })

  // --- compact mode and maxLines tests ---

  it('compact mode shows truncated lines with expand indicator', () => {
    const oldStr = Array.from({ length: 20 }, (_, i) => `old-line-${i}`).join('\n')
    const newStr = Array.from({ length: 20 }, (_, i) => `new-line-${i}`).join('\n')
    render(<DiffView oldStr={oldStr} newStr={newStr} compact />)

    const figure = screen.getByRole('figure', { name: /diff/i })
    // Compact mode limits to 5 lines
    const lineDivs = figure.querySelectorAll('.leading-relaxed > div')
    expect(lineDivs.length).toBeLessThanOrEqual(5)

    // Should show "more lines" indicator
    expect(screen.getByText(/more line/i)).toBeInTheDocument()
  })

  it('maxLines truncates at specified count', () => {
    const oldStr = Array.from({ length: 10 }, (_, i) => `line-${i}\n`).join('')
    const newStr = Array.from({ length: 10 }, (_, i) => `changed-${i}\n`).join('')
    render(<DiffView oldStr={oldStr} newStr={newStr} maxLines={3} />)

    const figure = screen.getByRole('figure', { name: /diff/i })
    const lineDivs = figure.querySelectorAll('.leading-relaxed > div')
    expect(lineDivs).toHaveLength(3)

    // Should show truncation message
    expect(screen.getByText(/more line/i)).toBeInTheDocument()
  })
})
