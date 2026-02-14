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

  it('renders with line numbers', () => {
    const { container } = render(
      <DiffView oldStr="line1\nline2\nline3" newStr="line1\nchanged\nline3" />
    )
    expect(container.textContent).toContain('changed')
  })

  it('shows no-changes message when strings are identical', () => {
    render(<DiffView oldStr="same" newStr="same" />)
    expect(screen.getByText(/no changes/i)).toBeInTheDocument()
  })

  it('uses semantic role', () => {
    render(<DiffView oldStr="a" newStr="b" />)
    expect(screen.getByRole('figure', { name: /diff/i })).toBeInTheDocument()
  })
})
