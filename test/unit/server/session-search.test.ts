import { describe, it, expect } from 'vitest'
import {
  SearchTier,
  SearchResultSchema,
  searchTitleTier,
  extractUserMessages,
  extractAllMessages,
  type SearchResult,
  type SearchMatch,
} from '../../../server/session-search.js'
import type { ProjectGroup } from '../../../server/claude-indexer.js'

describe('session-search types', () => {
  describe('SearchTier enum', () => {
    it('has three tiers: title, userMessages, fullText', () => {
      expect(SearchTier.Title).toBe('title')
      expect(SearchTier.UserMessages).toBe('userMessages')
      expect(SearchTier.FullText).toBe('fullText')
    })
  })

  describe('SearchResultSchema', () => {
    it('validates a valid search result', () => {
      const result: SearchResult = {
        sessionId: 'abc123',
        projectPath: '/home/user/project',
        title: 'Fix the bug',
        matchedIn: 'title',
        snippet: 'Fix the bug in login',
        updatedAt: Date.now(),
      }
      expect(() => SearchResultSchema.parse(result)).not.toThrow()
    })

    it('requires sessionId and projectPath', () => {
      const invalid = { title: 'Test' }
      expect(() => SearchResultSchema.parse(invalid)).toThrow()
    })
  })
})

describe('searchTitleTier()', () => {
  const mockProjects: ProjectGroup[] = [
    {
      projectPath: '/home/user/project-a',
      sessions: [
        {
          sessionId: 'session-1',
          projectPath: '/home/user/project-a',
          updatedAt: 1000,
          title: 'Fix the login bug',
          cwd: '/home/user/project-a',
        },
        {
          sessionId: 'session-2',
          projectPath: '/home/user/project-a',
          updatedAt: 2000,
          title: 'Add user authentication',
          cwd: '/home/user/project-a',
        },
      ],
    },
    {
      projectPath: '/home/user/project-b',
      sessions: [
        {
          sessionId: 'session-3',
          projectPath: '/home/user/project-b',
          updatedAt: 3000,
          title: 'Implement dark mode',
          summary: 'User requested dark mode feature',
          cwd: '/home/user/project-b',
        },
      ],
    },
  ]

  it('finds sessions matching query in title', () => {
    const results = searchTitleTier(mockProjects, 'login')
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-1')
    expect(results[0].matchedIn).toBe('title')
  })

  it('is case-insensitive', () => {
    const results = searchTitleTier(mockProjects, 'LOGIN')
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-1')
  })

  it('matches partial words', () => {
    const results = searchTitleTier(mockProjects, 'auth')
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-2')
  })

  it('also searches summary field', () => {
    const results = searchTitleTier(mockProjects, 'dark mode feature')
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('session-3')
  })

  it('returns empty array for no matches', () => {
    const results = searchTitleTier(mockProjects, 'nonexistent')
    expect(results).toHaveLength(0)
  })

  it('respects limit parameter', () => {
    const results = searchTitleTier(mockProjects, 'a', 1)
    expect(results).toHaveLength(1)
  })

  it('sorts by updatedAt descending', () => {
    const results = searchTitleTier(mockProjects, 'a')
    expect(results[0].updatedAt).toBeGreaterThanOrEqual(results[results.length - 1].updatedAt)
  })
})

describe('extractUserMessages()', () => {
  it('extracts user messages from simple format', () => {
    const content = [
      '{"type":"user","message":"Hello world","uuid":"1"}',
      '{"type":"assistant","message":"Hi there","uuid":"2"}',
      '{"type":"user","message":"How are you?","uuid":"3"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toBe('Hello world')
    expect(messages[1]).toBe('How are you?')
  })

  it('extracts user messages from nested message.content format', () => {
    const content = [
      '{"type":"user","message":{"role":"user","content":"Nested message"},"uuid":"1"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Nested message')
  })

  it('extracts user messages from content array format', () => {
    const content = [
      '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Array format"}]},"uuid":"1"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Array format')
  })

  it('skips non-user messages', () => {
    const content = [
      '{"type":"assistant","message":"Response","uuid":"1"}',
      '{"type":"system","subtype":"init","uuid":"2"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(0)
  })

  it('handles malformed JSON gracefully', () => {
    const content = [
      'not valid json',
      '{"type":"user","message":"Valid","uuid":"1"}',
    ].join('\n')

    const messages = extractUserMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Valid')
  })
})

describe('extractAllMessages()', () => {
  it('extracts both user and assistant messages', () => {
    const content = [
      '{"type":"user","message":"User says hello","uuid":"1"}',
      '{"type":"assistant","message":"Assistant responds","uuid":"2"}',
    ].join('\n')

    const messages = extractAllMessages(content)

    expect(messages).toHaveLength(2)
    expect(messages).toContain('User says hello')
    expect(messages).toContain('Assistant responds')
  })

  it('extracts text from assistant content arrays', () => {
    const content = [
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Main response"},{"type":"thinking","thinking":"Internal thought"}]},"uuid":"1"}',
    ].join('\n')

    const messages = extractAllMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Main response')
    expect(messages[0]).toContain('Internal thought')
  })

  it('skips system and progress messages', () => {
    const content = [
      '{"type":"system","subtype":"init","uuid":"1"}',
      '{"type":"progress","content":"Loading...","uuid":"2"}',
      '{"type":"user","message":"Hello","uuid":"3"}',
    ].join('\n')

    const messages = extractAllMessages(content)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe('Hello')
  })
})
