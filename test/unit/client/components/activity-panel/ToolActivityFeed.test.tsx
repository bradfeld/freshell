import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ToolActivityFeed from '../../../../../src/components/activity-panel/ToolActivityFeed'
import type { ActivityPanelEvent } from '../../../../../src/store/activityPanelTypes'

function makeToolCallEvent(
  name: string,
  args?: Record<string, unknown>,
): ActivityPanelEvent {
  return {
    id: `${name}-1`,
    event: {
      type: 'tool.call',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      provider: 'claude',
      tool: {
        callId: `call-${name}`,
        name,
        arguments: args,
      },
    },
  }
}

function makeToolResultEvent(name: string): ActivityPanelEvent {
  return {
    id: `result-${name}`,
    event: {
      type: 'tool.result',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      provider: 'claude',
      tool: {
        callId: `call-${name}`,
        name,
        output: 'done',
      },
    },
  }
}

describe('ToolActivityFeed', () => {
  afterEach(cleanup)

  it('renders ToolDetailPanel for Edit tool.call events', () => {
    const events = [
      makeToolCallEvent('Edit', {
        old_string: 'const a = 1',
        new_string: 'const b = 1',
        file_path: '/tmp/test.ts',
      }),
    ]
    render(<ToolActivityFeed events={events} />)
    // ToolDetailPanel renders a button with "Edit tool details" aria-label
    expect(screen.getByRole('button', { name: /edit tool details/i })).toBeInTheDocument()
  })

  it('renders ToolDetailPanel for Write tool.call events', () => {
    const events = [
      makeToolCallEvent('Write', {
        content: 'hello world',
        file_path: '/tmp/new.ts',
      }),
    ]
    render(<ToolActivityFeed events={events} />)
    expect(screen.getByRole('button', { name: /write tool details/i })).toBeInTheDocument()
  })

  it('renders flat EventRow for non-Edit/Write tool.call events', () => {
    const events = [
      makeToolCallEvent('Bash', { command: 'ls' }),
    ]
    render(<ToolActivityFeed events={events} />)
    // EventRow renders the tool name as label text, not a button with aria-label
    expect(screen.getByText('Bash')).toBeInTheDocument()
    // Should NOT have a ToolDetailPanel button
    expect(screen.queryByRole('button', { name: /bash tool details/i })).toBeNull()
  })

  it('renders flat EventRow for tool.result events', () => {
    const events = [makeToolResultEvent('Edit')]
    render(<ToolActivityFeed events={events} />)
    // Result events should be flat rows, not ToolDetailPanel
    expect(screen.queryByRole('button', { name: /edit tool details/i })).toBeNull()
    // Should show result info
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('shows empty state when no events', () => {
    render(<ToolActivityFeed events={[]} />)
    expect(screen.getByText(/no tool activity/i)).toBeInTheDocument()
  })
})
