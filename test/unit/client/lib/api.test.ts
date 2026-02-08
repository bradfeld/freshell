import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

import { api, searchSessions, type SearchResponse } from '@/lib/api'

describe('searchSessions()', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    localStorage.setItem('freshell.auth-token', 'test-token')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('calls /api/sessions/search with query', async () => {
    const mockResponse: SearchResponse = {
      results: [],
      tier: 'title',
      query: 'test',
      totalScanned: 0,
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    })

    await searchSessions({ query: 'test' })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/search?q=test&tier=title',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    )
  })

  it('includes tier parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ results: [], tier: 'fullText', query: 'test', totalScanned: 0 })),
    })

    await searchSessions({ query: 'test', tier: 'fullText' })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/search?q=test&tier=fullText',
      expect.anything()
    )
  })

  it('includes limit parameter when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ results: [], tier: 'title', query: 'test', totalScanned: 0 })),
    })

    await searchSessions({ query: 'test', limit: 10 })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/search?q=test&tier=title&limit=10',
      expect.anything()
    )
  })

  it('returns search response', async () => {
    const mockResponse: SearchResponse = {
      results: [
        { sessionId: 'abc', provider: 'claude', projectPath: '/proj', matchedIn: 'title', updatedAt: 1000 },
      ],
      tier: 'title',
      query: 'test',
      totalScanned: 5,
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    })

    const result = await searchSessions({ query: 'test' })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].sessionId).toBe('abc')
  })
})
