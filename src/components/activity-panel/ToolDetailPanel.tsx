import { useState, memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { extractEditToolArgs, extractWriteToolContent } from '@/lib/diff-utils'
import DiffView from '@/components/claude-chat/DiffView'
import FilePreview from './FilePreview'
import type { ActivityPanelEvent } from '@/store/activityPanelTypes'

interface ToolDetailPanelProps {
  panelEvent: ActivityPanelEvent
}

function ToolDetailPanel({ panelEvent }: ToolDetailPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const { event } = panelEvent

  const toolName = event.tool?.name ?? event.toolCall?.name ?? 'Unknown'
  const toolArgs = event.tool?.arguments ?? event.toolCall?.arguments

  // Try to extract structured arguments
  const editArgs = toolName === 'Edit' ? extractEditToolArgs(toolArgs) : null
  const writeArgs = toolName === 'Write' ? extractWriteToolContent(toolArgs) : null

  const filePath = editArgs?.filePath ?? writeArgs?.filePath

  // Build summary for compact header
  let summary: string
  if (editArgs) {
    const oldLines = editArgs.oldStr.split('\n').length
    const newLines = editArgs.newStr.split('\n').length
    const totalChanged = oldLines + newLines
    summary = `${totalChanged} line${totalChanged !== 1 ? 's' : ''} changed`
  } else if (writeArgs) {
    const lineCount = writeArgs.content.split('\n').length
    summary = `${lineCount} line${lineCount !== 1 ? 's' : ''}`
  } else {
    // Fallback: not Edit/Write or extraction failed
    summary = ''
  }

  // If neither Edit nor Write args extracted, show raw JSON fallback
  const showFallback = !editArgs && !writeArgs

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-accent/50"
        aria-expanded={expanded}
        aria-label={`${toolName} tool details`}
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 transition-transform', expanded && 'rotate-90')}
        />
        <span className="font-medium">{toolName}:</span>
        {filePath && (
          <span className="truncate text-muted-foreground font-mono">{filePath}</span>
        )}
        {summary && (
          <span className="shrink-0 text-muted-foreground">({summary})</span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2">
          {editArgs && (
            <DiffView
              oldStr={editArgs.oldStr}
              newStr={editArgs.newStr}
              filePath={editArgs.filePath}
              maxLines={100}
            />
          )}
          {writeArgs && (
            <FilePreview
              content={writeArgs.content}
              filePath={writeArgs.filePath}
              maxLines={100}
            />
          )}
          {showFallback && (
            <pre className="whitespace-pre-wrap font-mono opacity-80 max-h-48 overflow-y-auto">
              {toolArgs ? JSON.stringify(toolArgs, null, 2) : 'No arguments'}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(ToolDetailPanel)
