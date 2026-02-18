import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FloatingActionButton from '@/components/panes/FloatingActionButton'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Columns2: ({ className }: { className?: string }) => (
    <svg data-testid="columns2-icon" className={className} />
  ),
  Rows2: ({ className }: { className?: string }) => (
    <svg data-testid="rows2-icon" className={className} />
  ),
}))

describe('FloatingActionButton', () => {
  let onAdd: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onAdd = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders both split-right and split-down buttons', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    expect(screen.getByTitle('Split right')).toBeInTheDocument()
    expect(screen.getByTitle('Split down')).toBeInTheDocument()
  })

  it('calls onAdd with horizontal when split-right is clicked', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    fireEvent.click(screen.getByTitle('Split right'))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith('horizontal')
  })

  it('calls onAdd with vertical when split-down is clicked', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    fireEvent.click(screen.getByTitle('Split down'))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith('vertical')
  })

  it('has aria-labels for accessibility', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    expect(screen.getByTitle('Split right')).toHaveAttribute('aria-label', 'Split right')
    expect(screen.getByTitle('Split down')).toHaveAttribute('aria-label', 'Split down')
  })

  it('renders correct icons for each direction', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    expect(screen.getByTestId('columns2-icon')).toBeInTheDocument()
    expect(screen.getByTestId('rows2-icon')).toBeInTheDocument()
  })
})
