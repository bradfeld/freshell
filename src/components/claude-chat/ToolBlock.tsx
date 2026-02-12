import { useState, memo } from 'react'
import { ChevronRight, Terminal, FileText, Eye, Pencil, Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolBlockProps {
  name: string
  input?: Record<string, unknown>
  output?: string
  isError?: boolean
  status: 'running' | 'complete'
}

const TOOL_ICONS: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: Eye,
  Write: FileText,
  Edit: Pencil,
}

function getToolPreview(name: string, input?: Record<string, unknown>): string {
  if (!input) return ''
  if (name === 'Bash' && typeof input.command === 'string') {
    return `$ ${input.command.slice(0, 120)}`
  }
  if ((name === 'Read' || name === 'Write' || name === 'Edit') && typeof input.file_path === 'string') {
    return input.file_path
  }
  return JSON.stringify(input).slice(0, 100)
}

function ToolBlock({ name, input, output, isError, status }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TOOL_ICONS[name] || Terminal
  const preview = getToolPreview(name, input)

  return (
    <div
      className={cn(
        'border rounded my-1 text-xs',
        isError ? 'border-red-500/50' : 'border-border'
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-accent/50"
        aria-expanded={expanded}
        aria-label={`${name} tool call`}
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
        <Icon className="h-3 w-3 shrink-0" />
        <span className="font-medium">{name}</span>
        {preview && <span className="truncate text-muted-foreground font-mono">{preview}</span>}
        <span className="ml-auto shrink-0">
          {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === 'complete' && !isError && <Check className="h-3 w-3 text-green-500" />}
          {status === 'complete' && isError && <X className="h-3 w-3 text-red-500" />}
        </span>
      </button>

      {expanded && (
        <div className="px-2 py-1.5 border-t text-xs">
          {input && (
            <pre className="whitespace-pre-wrap font-mono opacity-80 max-h-48 overflow-y-auto">
              {name === 'Bash' && typeof input.command === 'string'
                ? input.command
                : JSON.stringify(input, null, 2)}
            </pre>
          )}
          {output && (
            <pre className={cn(
              'whitespace-pre-wrap font-mono max-h-48 overflow-y-auto mt-1',
              isError ? 'text-red-500' : 'opacity-80'
            )}>
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(ToolBlock)
