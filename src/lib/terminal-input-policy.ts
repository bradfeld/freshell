export type TerminalShortcutEvent = Pick<KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'type' | 'repeat'>

export function isTerminalPasteShortcut(event: TerminalShortcutEvent): boolean {
  if (event.type !== 'keydown') return false
  if (event.repeat) return false

  const keyV = event.key === 'v' || event.key === 'V' || event.code === 'KeyV'
  const ctrlOrMetaV = keyV && (event.ctrlKey || event.metaKey) && !event.altKey
  const shiftInsert = event.shiftKey && event.code === 'Insert'

  return ctrlOrMetaV || shiftInsert
}
