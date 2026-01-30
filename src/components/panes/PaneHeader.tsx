import { X, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TerminalStatus } from '@/store/types'

function StatusIndicator({ status }: { status: TerminalStatus }) {
  if (status === 'running') {
    return (
      <div className="relative">
        <Circle className="h-2 w-2 fill-success text-success" />
      </div>
    )
  }
  if (status === 'exited') {
    return <Circle className="h-2 w-2 text-muted-foreground/40" />
  }
  if (status === 'error') {
    return <Circle className="h-2 w-2 fill-destructive text-destructive" />
  }
  return <Circle className="h-2 w-2 text-muted-foreground/20 animate-pulse" />
}

interface PaneHeaderProps {
  title: string
  status: TerminalStatus
  isActive: boolean
  onClose: () => void
}

export default function PaneHeader({
  title,
  status,
  isActive,
  onClose,
}: PaneHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 h-7 px-2 text-sm border-b border-border shrink-0',
        isActive ? 'bg-muted' : 'bg-muted/50 text-muted-foreground'
      )}
    >
      <StatusIndicator status={status} />

      <span className="flex-1 truncate" title={title}>
        {title}
      </span>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-background/50 transition-opacity"
        title="Close pane"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
