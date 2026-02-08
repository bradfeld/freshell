export type FuzzyMatchResult = {
  score: number
  indices: number[]
}

const WORD_BOUNDARY_CHARS = new Set(['/', '\\', '-', '_', ' ', '.'])

export function fuzzyMatch(query: string, candidate: string): FuzzyMatchResult | null {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return { score: 0, indices: [] }
  }

  const normalizedCandidate = candidate.toLowerCase()
  const indices: number[] = []
  let cursor = 0

  for (const ch of normalizedQuery) {
    const index = normalizedCandidate.indexOf(ch, cursor)
    if (index === -1) return null
    indices.push(index)
    cursor = index + 1
  }

  let score = 0
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i]
    score += 10

    if (i === 0) {
      // Prefer earlier matches.
      score += Math.max(0, 20 - index)
    } else {
      const prev = indices[i - 1]
      if (index === prev + 1) {
        score += 8
      }
    }

    const prevChar = index > 0 ? candidate[index - 1] : ''
    if (index === 0 || WORD_BOUNDARY_CHARS.has(prevChar)) {
      score += 6
    }
  }

  // Prefer shorter candidates when all else is equal.
  score -= candidate.length * 0.2

  return { score, indices }
}
