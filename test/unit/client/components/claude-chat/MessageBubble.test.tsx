import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import MessageBubble from '../../../../../src/components/claude-chat/MessageBubble'

describe('MessageBubble', () => {
  afterEach(() => {
    cleanup()
  })
  it('renders user text message', () => {
    render(
      <MessageBubble
        role="user"
        content={[{ type: 'text', text: 'Hello world' }]}
      />
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'user message' })).toBeInTheDocument()
  })

  it('renders assistant text message with markdown', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'text', text: '**Bold text**' }]}
      />
    )
    expect(screen.getByText('Bold text')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'assistant message' })).toBeInTheDocument()
  })

  it('renders thinking block as collapsible', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'thinking', thinking: 'Let me think...' }]}
      />
    )
    expect(screen.getByText(/Thinking/)).toBeInTheDocument()
  })

  it('renders tool use block', () => {
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls -la' } }]}
      />
    )
    expect(screen.getByText('Bash')).toBeInTheDocument()
  })

  it('renders timestamp and model', () => {
    const timestamp = new Date().toISOString()
    render(
      <MessageBubble
        role="assistant"
        content={[{ type: 'text', text: 'Hi' }]}
        timestamp={timestamp}
        model="claude-sonnet-4-5"
      />
    )
    expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument()
  })
})
