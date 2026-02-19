import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface FilePreviewProps {
  content: string
  filePath?: string
  /** Show truncated view with line count summary. */
  compact?: boolean
  /** Maximum lines to render before truncation. */
  maxLines?: number
}

function FilePreview({ content, filePath, compact, maxLines }: FilePreviewProps) {
  const allLines = useMemo(
    () => content.replace(/\n$/, '').split('\n'),
    [content],
  )

  if (!content) {
    return (
      <div role="figure" aria-label="file preview" className="text-xs text-muted-foreground italic py-1">
        Empty file
      </div>
    )
  }

  if (compact) {
    return (
      <div role="figure" aria-label="file preview" className="text-xs text-muted-foreground py-1">
        {filePath && (
          <span className="font-mono">{filePath}</span>
        )}
        {filePath && ' — '}
        <span>{allLines.length} line{allLines.length !== 1 ? 's' : ''}</span>
      </div>
    )
  }

  const visibleLines = maxLines ? allLines.slice(0, maxLines) : allLines
  const hiddenCount = maxLines ? Math.max(0, allLines.length - maxLines) : 0

  return (
    <div
      role="figure"
      aria-label="file preview"
      className="text-xs font-mono overflow-x-auto"
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
            className={cn('flex px-1', 'bg-green-500/10 text-green-400')}
          >
            <span className="w-8 shrink-0 text-right pr-2 select-none opacity-50">
              {i + 1}
            </span>
            <span className="shrink-0 w-4 select-none">+</span>
            <span className="whitespace-pre">{line}</span>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="text-center text-xs text-muted-foreground py-1">
          ... {hiddenCount} more line{hiddenCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

export default memo(FilePreview)
