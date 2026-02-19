import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { computeLineDiffWithWordHighlights, type DiffLine, type WordChange } from '@/lib/diff-utils'

interface DiffViewProps {
  oldStr: string
  newStr: string
  filePath?: string
  /** Show truncated view with limited lines. */
  compact?: boolean
  /** Maximum lines to render before truncation. */
  maxLines?: number
  /** Callback when compact expand is clicked. */
  onExpand?: () => void
}

function WordSpan({ word, lineType }: { word: WordChange; lineType: 'added' | 'removed' }) {
  if (word.type === 'common') {
    return <span className="whitespace-pre">{word.value}</span>
  }

  return (
    <span
      className={cn(
        'whitespace-pre rounded-sm',
        lineType === 'removed' && 'bg-red-500/30',
        lineType === 'added' && 'bg-green-500/30',
      )}
      data-word-change={word.type}
    >
      {word.value}
    </span>
  )
}

function LineContent({ line }: { line: DiffLine }) {
  if (line.words && line.words.length > 0 && line.type !== 'context') {
    return (
      <span className="whitespace-pre">
        {line.words.map((word, wi) => (
          <WordSpan key={wi} word={word} lineType={line.type as 'added' | 'removed'} />
        ))}
      </span>
    )
  }

  return <span className="whitespace-pre">{line.text}</span>
}

function DiffView({ oldStr, newStr, filePath, compact, maxLines, onExpand }: DiffViewProps) {
  const allLines = useMemo(
    () => computeLineDiffWithWordHighlights(oldStr, newStr),
    [oldStr, newStr],
  )

  const hasChanges = allLines.some(l => l.type !== 'context')

  if (!hasChanges) {
    return (
      <div role="figure" aria-label="diff view" className="text-xs text-muted-foreground italic py-1">
        No changes detected
      </div>
    )
  }

  // Determine visible lines based on compact/maxLines
  const effectiveMax = compact ? 5 : maxLines
  const visibleLines = effectiveMax ? allLines.slice(0, effectiveMax) : allLines
  const hiddenCount = effectiveMax ? Math.max(0, allLines.length - effectiveMax) : 0

  return (
    <div
      role="figure"
      aria-label="diff view"
      className="text-xs font-mono overflow-x-auto"
      data-diff=""
      data-file-path={filePath}
    >
      {filePath && (
        <div className="text-muted-foreground px-2 py-0.5 border-b border-border/50">
          {filePath}
        </div>
      )}
      <div className="leading-relaxed">
        {visibleLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex px-1',
              line.type === 'removed' && 'bg-red-500/10 text-red-400',
              line.type === 'added' && 'bg-green-500/10 text-green-400',
              line.type === 'context' && 'text-muted-foreground',
            )}
          >
            <span className="w-8 shrink-0 text-right pr-2 select-none opacity-50">
              {line.lineNo}
            </span>
            <span className="shrink-0 w-4 select-none">
              {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
            </span>
            <LineContent line={line} />
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground py-1 hover:bg-accent/50"
          onClick={onExpand}
          aria-label={`Show ${hiddenCount} more lines`}
        >
          ... {hiddenCount} more line{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

export default memo(DiffView)
