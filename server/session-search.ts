import { z } from 'zod'
import type { ProjectGroup, ClaudeSession } from './claude-indexer.js'

export const SearchTier = {
  Title: 'title',
  UserMessages: 'userMessages',
  FullText: 'fullText',
} as const

export type SearchTierType = (typeof SearchTier)[keyof typeof SearchTier]

export const SearchMatchSchema = z.object({
  line: z.number(),
  text: z.string(),
  context: z.string().optional(),
})

export type SearchMatch = z.infer<typeof SearchMatchSchema>

export const SearchResultSchema = z.object({
  sessionId: z.string(),
  projectPath: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  matchedIn: z.enum(['title', 'userMessage', 'assistantMessage', 'summary']),
  snippet: z.string().optional(),
  updatedAt: z.number(),
  cwd: z.string().optional(),
})

export type SearchResult = z.infer<typeof SearchResultSchema>

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  tier: z.enum(['title', 'userMessages', 'fullText']).default('title'),
  limit: z.number().min(1).max(100).default(50),
})

export type SearchRequest = z.infer<typeof SearchRequestSchema>

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  tier: z.enum(['title', 'userMessages', 'fullText']),
  query: z.string(),
  totalScanned: z.number(),
})

export type SearchResponse = z.infer<typeof SearchResponseSchema>

export function searchTitleTier(
  projects: ProjectGroup[],
  query: string,
  limit = 50
): SearchResult[] {
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const project of projects) {
    for (const session of project.sessions) {
      const titleMatch = session.title?.toLowerCase().includes(q)
      const summaryMatch = session.summary?.toLowerCase().includes(q)

      if (titleMatch || summaryMatch) {
        results.push({
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          title: session.title,
          summary: session.summary,
          matchedIn: titleMatch ? 'title' : 'summary',
          snippet: titleMatch ? session.title : session.summary,
          updatedAt: session.updatedAt,
          cwd: session.cwd,
        })
      }
    }
  }

  results.sort((a, b) => b.updatedAt - a.updatedAt)
  return results.slice(0, limit)
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block
        if (block?.type === 'text' && typeof block.text === 'string') return block.text
        if (block?.type === 'thinking' && typeof block.thinking === 'string') return block.thinking
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

function extractMessageText(obj: Record<string, unknown>): string | null {
  // Direct message string
  if (typeof obj.message === 'string') {
    return obj.message
  }
  // Nested message.content
  if (obj.message && typeof obj.message === 'object') {
    const msg = obj.message as Record<string, unknown>
    const content = msg.content
    return extractTextFromContent(content) || null
  }
  // Direct content field
  if (obj.content) {
    return extractTextFromContent(obj.content) || null
  }
  return null
}

export function extractUserMessages(content: string): string[] {
  const messages: string[] = []
  const lines = content.split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>
      if (obj.type !== 'user') continue

      const text = extractMessageText(obj)
      if (text) messages.push(text)
    } catch {
      // Skip malformed JSON
    }
  }

  return messages
}

export function extractAllMessages(content: string): string[] {
  const messages: string[] = []
  const lines = content.split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>
      if (obj.type !== 'user' && obj.type !== 'assistant') continue

      const text = extractMessageText(obj)
      if (text) messages.push(text)
    } catch {
      // Skip malformed JSON
    }
  }

  return messages
}
