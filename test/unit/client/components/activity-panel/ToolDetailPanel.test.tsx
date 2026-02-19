import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ToolDetailPanel from '../../../../../src/components/activity-panel/ToolDetailPanel'
import type { ActivityPanelEvent } from '../../../../../src/store/activityPanelTypes'

function makeEditEvent(args: Record<string, unknown>): ActivityPanelEvent {
  return {
    id: 'edit-1',
    event: {
      type: 'tool.call',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      provider: 'claude',
      tool: {
        callId: 'call-1',
        name: 'Edit',
        arguments: args,
      },
    },
  }
}

function makeWriteEvent(args: Record<string, unknown>): ActivityPanelEvent {
  return {
    id: 'write-1',
    event: {
      type: 'tool.call',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      provider: 'claude',
      tool: {
        callId: 'call-2',
        name: 'Write',
        arguments: args,
      },
    },
  }
}

function makeBashEvent(): ActivityPanelEvent {
  return {
    id: 'bash-1',
    event: {
      type: 'tool.call',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      provider: 'claude',
      tool: {
        callId: 'call-3',
        name: 'Bash',
        arguments: { command: 'ls -la' },
      },
    },
  }
}

describe('ToolDetailPanel', () => {
  afterEach(cleanup)

  it('renders compact Edit diff with file path summary', () => {
    const event = makeEditEvent({
      old_string: 'const a = 1',
      new_string: 'const b = 1',
      file_path: '/tmp/test.ts',
    })
    render(<ToolDetailPanel panelEvent={event} />)
    expect(screen.getByText('Edit:')).toBeInTheDocument()
    expect(screen.getByText('/tmp/test.ts')).toBeInTheDocument()
  })

  it('expands to show full diff on click', () => {
    const event = makeEditEvent({
      old_string: 'const foo = 1',
      new_string: 'const bar = 1',
      file_path: '/tmp/test.ts',
    })
    render(<ToolDetailPanel panelEvent={event} />)

    // Click to expand
    const button = screen.getByRole('button', { name: /edit tool details/i })
    fireEvent.click(button)

    // Should now show the diff view
    expect(screen.getByRole('figure', { name: /diff view/i })).toBeInTheDocument()
  })

  it('renders compact Write preview with file path summary', () => {
    const event = makeWriteEvent({
      content: 'hello\nworld\n',
      file_path: '/tmp/new-file.ts',
    })
    render(<ToolDetailPanel panelEvent={event} />)
    expect(screen.getByText('Write:')).toBeInTheDocument()
    expect(screen.getByText('/tmp/new-file.ts')).toBeInTheDocument()
  })

  it('expands Write preview to show file content', () => {
    const event = makeWriteEvent({
      content: 'const x = 42',
      file_path: '/tmp/new.ts',
    })
    render(<ToolDetailPanel panelEvent={event} />)

    const button = screen.getByRole('button', { name: /write tool details/i })
    fireEvent.click(button)

    expect(screen.getByRole('figure', { name: /file preview/i })).toBeInTheDocument()
  })

  it('falls back to JSON for unknown tool types', () => {
    const event = makeBashEvent()
    render(<ToolDetailPanel panelEvent={event} />)

    const button = screen.getByRole('button', { name: /bash tool details/i })
    fireEvent.click(button)

    // Should show JSON fallback
    expect(screen.getByText(/ls -la/)).toBeInTheDocument()
  })

  it('falls back to JSON when arguments extraction fails', () => {
    const event = makeEditEvent({
      // Missing old_string and new_string — extraction will return null
      some_random_field: 'value',
    })
    render(<ToolDetailPanel panelEvent={event} />)

    const button = screen.getByRole('button', { name: /edit tool details/i })
    fireEvent.click(button)

    // Should show raw JSON since extractEditToolArgs returns null
    expect(screen.getByText(/some_random_field/)).toBeInTheDocument()
  })

  it('has correct aria-expanded attribute', () => {
    const event = makeEditEvent({
      old_string: 'a',
      new_string: 'b',
    })
    render(<ToolDetailPanel panelEvent={event} />)

    const button = screen.getByRole('button', { name: /edit tool details/i })
    expect(button.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })
})
