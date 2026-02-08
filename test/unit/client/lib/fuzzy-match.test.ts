import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from '@/lib/fuzzy-match'

describe('fuzzyMatch', () => {
  it('returns null when query is not a subsequence of candidate', () => {
    expect(fuzzyMatch('zzz', '/home/user/project')).toBeNull()
  })

  it('is case-insensitive', () => {
    const match = fuzzyMatch('CoDe', '/Users/alice/code/freshell')
    expect(match).not.toBeNull()
    expect(match?.indices.length).toBe(4)
  })

  it('gives higher score for consecutive matches', () => {
    const consecutive = fuzzyMatch('abc', '/tmp/abc')!
    const nonConsecutive = fuzzyMatch('abc', '/tmp/a_b_c')!
    expect(consecutive.score).toBeGreaterThan(nonConsecutive.score)
  })

  it('gives higher score for word-boundary matches', () => {
    const boundary = fuzzyMatch('bar', '/workspace/foo-bar')!
    const nonBoundary = fuzzyMatch('bar', '/workspace/foobar')!
    expect(boundary.score).toBeGreaterThan(nonBoundary.score)
  })

  it('supports sorting by score for candidate ranking', () => {
    const query = 'bar'
    const candidates = [
      '/home/user/projects/foo-bar',
      '/home/user/projects/sidebar',
      '/home/user/projects/baz',
    ]

    const ranked = candidates
      .map((candidate) => ({ candidate, match: fuzzyMatch(query, candidate) }))
      .filter((entry): entry is { candidate: string; match: NonNullable<ReturnType<typeof fuzzyMatch>> } => !!entry.match)
      .sort((a, b) => b.match.score - a.match.score)

    expect(ranked[0]?.candidate).toBe('/home/user/projects/foo-bar')
    expect(ranked[1]?.candidate).toBe('/home/user/projects/sidebar')
  })
})
