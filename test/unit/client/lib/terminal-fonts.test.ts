import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolveTerminalFontFamily,
  loadLocalTerminalFontFamily,
  saveLocalTerminalFontFamily,
  LOCAL_TERMINAL_FONT_KEY,
} from '@/lib/terminal-fonts'

describe('terminal fonts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resolves a font family with a monospace fallback', () => {
    const resolved = resolveTerminalFontFamily('Consolas')
    const parts = resolved.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))

    expect(parts[0]).toBe('Consolas')
    expect(parts[parts.length - 1]).toBe('monospace')
  })

  it('resolves a safe stack when no preferred font is provided', () => {
    const resolved = resolveTerminalFontFamily(undefined)
    const parts = resolved.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))

    expect(parts.length).toBeGreaterThan(0)
    expect(parts[parts.length - 1]).toBe('monospace')
  })

  it('persists and loads local terminal font preference', () => {
    expect(loadLocalTerminalFontFamily()).toBeNull()

    saveLocalTerminalFontFamily('Fira Code')
    expect(localStorage.getItem(LOCAL_TERMINAL_FONT_KEY)).toBe('Fira Code')
    expect(loadLocalTerminalFontFamily()).toBe('Fira Code')

    saveLocalTerminalFontFamily(null)
    expect(localStorage.getItem(LOCAL_TERMINAL_FONT_KEY)).toBeNull()
    expect(loadLocalTerminalFontFamily()).toBeNull()
  })
})
