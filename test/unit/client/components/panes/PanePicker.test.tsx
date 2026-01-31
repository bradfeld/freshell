import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PanePicker from '@/components/panes/PanePicker'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Terminal: ({ className }: { className?: string }) => (
    <svg data-testid="terminal-icon" className={className} />
  ),
  Globe: ({ className }: { className?: string }) => (
    <svg data-testid="globe-icon" className={className} />
  ),
  FileText: ({ className }: { className?: string }) => (
    <svg data-testid="file-text-icon" className={className} />
  ),
}))

describe('PanePicker', () => {
  let onSelect: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSelect = vi.fn()
    onCancel = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  describe('rendering', () => {
    it('renders all three options', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      expect(screen.getByText('Shell')).toBeInTheDocument()
      expect(screen.getByText('Browser')).toBeInTheDocument()
      expect(screen.getByText('Editor')).toBeInTheDocument()
    })

    it('renders icons for each option', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      expect(screen.getByTestId('terminal-icon')).toBeInTheDocument()
      expect(screen.getByTestId('globe-icon')).toBeInTheDocument()
      expect(screen.getByTestId('file-text-icon')).toBeInTheDocument()
    })
  })

  describe('mouse interaction', () => {
    it('calls onSelect with shell when Shell is clicked', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      fireEvent.click(screen.getByText('Shell'))
      expect(onSelect).toHaveBeenCalledWith('shell')
    })
  })

  describe('keyboard shortcuts', () => {
    it('calls onSelect with shell on S key', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      fireEvent.keyDown(document, { key: 's' })
      expect(onSelect).toHaveBeenCalledWith('shell')
    })

    it('shortcuts are case-insensitive', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      fireEvent.keyDown(document, { key: 'S' })
      expect(onSelect).toHaveBeenCalledWith('shell')
    })
  })

  describe('arrow key navigation', () => {
    it('moves focus right with ArrowRight', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      const shellButton = screen.getByText('Shell').closest('button')!
      shellButton.focus()
      fireEvent.keyDown(shellButton, { key: 'ArrowRight' })
      const browserButton = screen.getByText('Browser').closest('button')!
      expect(browserButton).toHaveFocus()
    })

    it('selects focused option on Enter', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      const browserButton = screen.getByText('Browser').closest('button')!
      browserButton.focus()
      fireEvent.keyDown(browserButton, { key: 'Enter' })
      expect(onSelect).toHaveBeenCalledWith('browser')
    })
  })

  describe('escape behavior', () => {
    it('calls onCancel on Escape when not only pane', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onCancel).toHaveBeenCalled()
    })

    it('does not call onCancel on Escape when only pane', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={true} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onCancel).not.toHaveBeenCalled()
    })
  })

  describe('shortcut hints', () => {
    it('shows shortcut hint on hover', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      const shellButton = screen.getByText('Shell').closest('button')!
      fireEvent.mouseEnter(shellButton)
      expect(screen.getByText('S', { selector: '.shortcut-hint' })).toBeInTheDocument()
    })

    it('hides shortcut hint on mouse leave', () => {
      render(<PanePicker onSelect={onSelect} onCancel={onCancel} isOnlyPane={false} />)
      const shellButton = screen.getByText('Shell').closest('button')!
      fireEvent.mouseEnter(shellButton)
      fireEvent.mouseLeave(shellButton)
      expect(screen.queryByText('S', { selector: '.shortcut-hint' })).not.toBeInTheDocument()
    })
  })
})
