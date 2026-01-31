import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FloatingActionButton from '@/components/panes/FloatingActionButton'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Plus: ({ className }: { className?: string }) => (
    <svg data-testid="plus-icon" className={className} />
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

  it('renders the FAB button', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    expect(screen.getByTitle('Add pane')).toBeInTheDocument()
  })

  it('calls onAdd when clicked', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    fireEvent.click(screen.getByTitle('Add pane'))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('has aria-label for accessibility', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    expect(screen.getByTitle('Add pane')).toHaveAttribute('aria-label', 'Add pane')
  })

  it('calls onAdd on Enter key', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    const button = screen.getByTitle('Add pane')
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('calls onAdd on Space key', () => {
    render(<FloatingActionButton onAdd={onAdd} />)
    const button = screen.getByTitle('Add pane')
    fireEvent.keyDown(button, { key: ' ' })
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
