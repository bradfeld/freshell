import { Columns2, Rows2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingActionButtonProps {
  onAdd: (direction: 'horizontal' | 'vertical') => void
}

const buttonStyles = cn(
  'h-10 w-10 rounded-full bg-foreground text-background',
  'flex items-center justify-center',
  'shadow-lg hover:shadow-xl transition-all',
  'hover:scale-105 active:scale-95'
)

export default function FloatingActionButton({ onAdd }: FloatingActionButtonProps) {
  return (
    <div className="absolute bottom-12 right-4 z-50 flex flex-col gap-2">
      <button
        onClick={() => onAdd('vertical')}
        aria-label="Split down"
        className={buttonStyles}
        title="Split down"
      >
        <Rows2 className="h-4 w-4" />
      </button>
      <button
        onClick={() => onAdd('horizontal')}
        aria-label="Split right"
        className={buttonStyles}
        title="Split right"
      >
        <Columns2 className="h-4 w-4" />
      </button>
    </div>
  )
}
