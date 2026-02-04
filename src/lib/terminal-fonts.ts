import type { AppSettings } from '@/store/types'

export const LOCAL_TERMINAL_FONT_KEY = 'freshell.terminal.fontFamily.v1'
const DEFAULT_LOCAL_FONT_FAMILY = 'monospace'

const DEFAULT_MONO_FALLBACKS = [
  'Cascadia Mono',
  'Cascadia Code',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'IBM Plex Mono',
  'Menlo',
  'Monaco',
  'Consolas',
  'Liberation Mono',
  'DejaVu Sans Mono',
  'Noto Sans Mono',
  'Roboto Mono',
  'Droid Sans Mono',
  'monospace',
]

const GENERIC_FONTS = new Set(['monospace', 'serif', 'sans-serif', 'ui-monospace', 'system-ui'])

function normalizeFontToken(token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  if (GENERIC_FONTS.has(lower)) return lower

  const hasQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  if (hasQuotes) return trimmed

  if (/\s/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, '\\"')}"`
  }
  return trimmed
}

function tokenKey(token: string): string {
  return token.replace(/^['"]|['"]$/g, '').toLowerCase()
}

function splitFontStack(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

export function resolveTerminalFontFamily(preferred?: string | null): string {
  const preferredTokens = preferred ? splitFontStack(preferred) : []
  const allTokens = [...preferredTokens, ...DEFAULT_MONO_FALLBACKS]
  const seen = new Set<string>()
  const resolved: string[] = []

  for (const token of allTokens) {
    const normalized = normalizeFontToken(token)
    if (!normalized) continue
    const key = tokenKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    resolved.push(normalized)
  }

  return resolved.length > 0 ? resolved.join(', ') : 'monospace'
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

export function loadLocalTerminalFontFamily(): string | null {
  if (!canUseStorage()) return null
  try {
    const value = window.localStorage.getItem(LOCAL_TERMINAL_FONT_KEY)
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

export function saveLocalTerminalFontFamily(value: string | null | undefined): void {
  if (!canUseStorage()) return
  try {
    const trimmed = value?.trim()
    if (!trimmed) {
      window.localStorage.removeItem(LOCAL_TERMINAL_FONT_KEY)
      return
    }
    window.localStorage.setItem(LOCAL_TERMINAL_FONT_KEY, trimmed)
  } catch {
    // ignore storage failures
  }
}

export function applyLocalTerminalFontFamily(settings: AppSettings): AppSettings {
  const local = loadLocalTerminalFontFamily()
  const nextFont = local ?? DEFAULT_LOCAL_FONT_FAMILY

  if (!local) {
    saveLocalTerminalFontFamily(nextFont)
  }

  return {
    ...settings,
    terminal: {
      ...(settings?.terminal || {}),
      fontFamily: nextFont,
    },
  }
}
