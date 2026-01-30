import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PaneHeader from '@/components/panes/PaneHeader'

vi.mock('lucide-react', () => ({
  X: ({ className }: { className?: string }) => (
    <svg data-testid="x-icon" className={className} />
  ),
  Circle: ({ className }: { className?: string }) => (
    <svg data-testid="circle-icon" className={className} />
  ),
}))

describe('PaneHeader', () => {
  afterEach(() => {
    cleanup()
  })

  describe('rendering', () => {
    it('renders the title', () => {
      render(
        <PaneHeader
          title="My Terminal"
          status="running"
          isActive={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('My Terminal')).toBeInTheDocument()
    })

    it('renders status indicator', () => {
      render(
        <PaneHeader
          title="My Terminal"
          status="running"
          isActive={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByTestId('circle-icon')).toBeInTheDocument()
    })

    it('renders close button', () => {
      render(
        <PaneHeader
          title="My Terminal"
          status="running"
          isActive={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByTitle('Close pane')).toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      render(
        <PaneHeader
          title="My Terminal"
          status="running"
          isActive={true}
          onClose={onClose}
        />
      )

      fireEvent.click(screen.getByTitle('Close pane'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('stops propagation on close button click', () => {
      const onClose = vi.fn()
      const parentClick = vi.fn()

      render(
        <div onClick={parentClick}>
          <PaneHeader
            title="My Terminal"
            status="running"
            isActive={true}
            onClose={onClose}
          />
        </div>
      )

      fireEvent.click(screen.getByTitle('Close pane'))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(parentClick).not.toHaveBeenCalled()
    })
  })

  describe('styling', () => {
    it('applies active styling when active', () => {
      const { container } = render(
        <PaneHeader
          title="My Terminal"
          status="running"
          isActive={true}
          onClose={vi.fn()}
        />
      )

      const header = container.firstChild as HTMLElement
      expect(header.className).toContain('bg-muted')
      expect(header.className).not.toContain('bg-muted/50')
    })

    it('applies inactive styling when not active', () => {
      const { container } = render(
        <PaneHeader
          title="My Terminal"
          status="running"
          isActive={false}
          onClose={vi.fn()}
        />
      )

      const header = container.firstChild as HTMLElement
      expect(header.className).toContain('bg-muted/50')
    })
  })
})
