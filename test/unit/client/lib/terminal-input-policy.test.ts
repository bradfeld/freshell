import { describe, expect, it } from 'vitest'
import { isTerminalPasteShortcut } from '@/lib/terminal-input-policy'

function e(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    type: 'keydown',
    ...partial,
  } as KeyboardEvent
}

describe('isTerminalPasteShortcut', () => {
  it('matches Ctrl+V', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, key: 'v', code: 'KeyV' }))).toBe(true)
  })

  it('matches Ctrl+Shift+V', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, shiftKey: true, key: 'V', code: 'KeyV' }))).toBe(true)
  })

  it('matches Meta+V (macOS)', () => {
    expect(isTerminalPasteShortcut(e({ metaKey: true, key: 'v', code: 'KeyV' }))).toBe(true)
  })

  it('matches Shift+Insert', () => {
    expect(isTerminalPasteShortcut(e({ shiftKey: true, key: 'Insert', code: 'Insert' }))).toBe(true)
  })

  it('ignores non-keydown and repeats', () => {
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, key: 'v', code: 'KeyV', type: 'keyup' }))).toBe(false)
    expect(isTerminalPasteShortcut(e({ ctrlKey: true, key: 'v', code: 'KeyV', repeat: true }))).toBe(false)
  })
})
