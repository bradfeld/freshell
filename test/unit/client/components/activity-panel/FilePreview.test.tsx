import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import FilePreview from '../../../../../src/components/activity-panel/FilePreview'

describe('FilePreview', () => {
  afterEach(cleanup)

  it('renders all lines as added with + prefix', () => {
    render(<FilePreview content={'line1\nline2\nline3'} />)
    const figure = screen.getByRole('figure', { name: /file preview/i })
    const lineDivs = figure.querySelectorAll('.leading-relaxed > div')
    expect(lineDivs).toHaveLength(3)

    // Each line should have a + prefix
    for (const div of lineDivs) {
      const spans = div.querySelectorAll('span')
      expect(spans[1]?.textContent).toBe('+')
    }
  })

  it('shows file path header when provided', () => {
    render(<FilePreview content="hello" filePath="/tmp/new-file.ts" />)
    expect(screen.getByText('/tmp/new-file.ts')).toBeInTheDocument()
  })

  it('compact mode shows line count summary only', () => {
    render(<FilePreview content={'a\nb\nc\nd\ne'} filePath="/tmp/file.ts" compact />)
    expect(screen.getByText(/5 lines/)).toBeInTheDocument()
    // Should NOT render the full content lines
    const figure = screen.getByRole('figure', { name: /file preview/i })
    expect(figure.querySelector('.leading-relaxed')).toBeNull()
  })

  it('maxLines truncates output', () => {
    const content = Array.from({ length: 20 }, (_, i) => `line-${i}`).join('\n')
    render(<FilePreview content={content} maxLines={5} />)
    const figure = screen.getByRole('figure', { name: /file preview/i })
    const lineDivs = figure.querySelectorAll('.leading-relaxed > div')
    expect(lineDivs).toHaveLength(5)
    expect(screen.getByText(/15 more lines/)).toBeInTheDocument()
  })

  it('has accessible role and label', () => {
    render(<FilePreview content="test" />)
    expect(screen.getByRole('figure', { name: /file preview/i })).toBeInTheDocument()
  })

  it('handles empty content gracefully', () => {
    render(<FilePreview content="" />)
    expect(screen.getByText(/empty file/i)).toBeInTheDocument()
  })
})
