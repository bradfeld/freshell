import { Plus } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addTab, closeTab, setActiveTab, updateTab } from '@/store/tabsSlice'
import { getWsClient } from '@/lib/ws-client'
import { useMemo, useState } from 'react'
import TabItem from './TabItem'

export default function TabBar() {
  const dispatch = useAppDispatch()
  const { tabs, activeTabId } = useAppSelector((s) => s.tabs)

  const ws = useMemo(() => getWsClient(), [])

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  if (tabs.length === 0) return null

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b border-border/30 bg-background">
      <div className="flex items-center gap-0.5 overflow-x-auto flex-1 py-1">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isDragging={false}
            isRenaming={renamingId === tab.id}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameBlur={() => {
              dispatch(
                updateTab({
                  id: tab.id,
                  updates: { title: renameValue || tab.title, titleSetByUser: true },
                })
              )
              setRenamingId(null)
            }}
            onRenameKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            onClose={(e) => {
              if (tab.terminalId) {
                ws.send({
                  type: e.shiftKey ? 'terminal.kill' : 'terminal.detach',
                  terminalId: tab.terminalId,
                })
              }
              dispatch(closeTab(tab.id))
            }}
            onClick={() => dispatch(setActiveTab(tab.id))}
            onDoubleClick={() => {
              setRenamingId(tab.id)
              setRenameValue(tab.title)
            }}
          />
        ))}
      </div>

      <button
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="New shell tab"
        onClick={() => dispatch(addTab({ mode: 'shell' }))}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
