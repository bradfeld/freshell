import type { TerminalMetaRecord } from '@/store/terminalMetaSlice'

function safeBasename(input?: string): string | undefined {
  if (!input) return undefined
  const normalized = input.replace(/[\\/]+$/, '')
  if (!normalized) return undefined
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || normalized
}

export function formatPaneRuntimeLabel(meta: TerminalMetaRecord | undefined): string | undefined {
  if (!meta) return undefined

  const subdir = meta.displaySubdir || safeBasename(meta.checkoutRoot) || safeBasename(meta.cwd)
  const branch = meta.branch
  const percentRaw = meta.tokenUsage?.compactPercent
  const percent = typeof percentRaw === 'number' && Number.isFinite(percentRaw)
    ? `${Math.max(0, Math.min(100, Math.round(percentRaw)))}%`
    : undefined

  const leftParts = [
    subdir,
    branch ? `(${branch}${meta.isDirty ? '*' : ''})` : undefined,
  ].filter(Boolean)

  if (!leftParts.length && !percent) return undefined

  const left = leftParts.join(' ')
  if (!percent) return left || undefined
  return left ? `${left}  ${percent}` : percent
}
