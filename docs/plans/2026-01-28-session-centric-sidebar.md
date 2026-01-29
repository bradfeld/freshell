# Session-Centric Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace terminal-centric sidebar with session-centric view where sessions show a play icon when running in a terminal.

**Architecture:**
- Backend tracks which session each Claude terminal is running via `resumeSessionId`
- `terminal.list` response includes `resumeSessionId` for linking
- Sidebar filters out shell-only terminals and displays only sessions
- Sessions get a play icon indicator when a running terminal has matching `resumeSessionId`

**Tech Stack:** TypeScript, React, WebSocket API, node-pty

---

## Task 1: Add resumeSessionId to TerminalRecord

**Files:**
- Modify: `server/terminal-registry.ts:17-33`

**Step 1: Add resumeSessionId to TerminalRecord type**

In `server/terminal-registry.ts`, update the `TerminalRecord` type to include `resumeSessionId`:

```typescript
export type TerminalRecord = {
  terminalId: string
  title: string
  description?: string
  mode: TerminalMode
  resumeSessionId?: string  // ADD THIS LINE
  createdAt: number
  lastActivityAt: number
  status: 'running' | 'exited'
  exitCode?: number
  cwd?: string
  cols: number
  rows: number
  clients: Set<WebSocket>
  warnedIdle?: boolean
  buffer: ChunkRingBuffer
  pty: pty.IPty
}
```

**Step 2: Store resumeSessionId when creating terminal**

In the `create()` method around line 307, add `resumeSessionId` to the record:

```typescript
const record: TerminalRecord = {
  terminalId,
  title,
  description: undefined,
  mode: opts.mode,
  resumeSessionId: opts.resumeSessionId,  // ADD THIS LINE
  createdAt,
  // ... rest unchanged
}
```

**Step 3: Include resumeSessionId in list() output**

In the `list()` method around line 405, add `resumeSessionId` to the returned object:

```typescript
list(): Array<{
  terminalId: string
  title: string
  description?: string
  mode: TerminalMode
  resumeSessionId?: string  // ADD THIS LINE
  createdAt: number
  lastActivityAt: number
  status: 'running' | 'exited'
  hasClients: boolean
  cwd?: string
}> {
  return Array.from(this.terminals.values()).map((t) => ({
    terminalId: t.terminalId,
    title: t.title,
    description: t.description,
    mode: t.mode,
    resumeSessionId: t.resumeSessionId,  // ADD THIS LINE
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    status: t.status,
    hasClients: t.clients.size > 0,
    cwd: t.cwd,
  }))
}
```

**Step 4: Commit**

```bash
git add server/terminal-registry.ts
git commit -m "feat: track resumeSessionId on terminal records

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Update BackgroundTerminal type on frontend

**Files:**
- Modify: `src/store/types.ts:32-40`

**Step 1: Add resumeSessionId and mode to BackgroundTerminal**

```typescript
export interface BackgroundTerminal {
  terminalId: string
  title: string
  createdAt: number
  lastActivityAt: number
  cwd?: string
  status: 'running' | 'exited'
  hasClients: boolean
  mode?: 'shell' | 'claude' | 'codex'  // ADD THIS LINE
  resumeSessionId?: string             // ADD THIS LINE
}
```

**Step 2: Commit**

```bash
git add src/store/types.ts
git commit -m "feat: add mode and resumeSessionId to BackgroundTerminal type

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Include mode in terminal.list response

**Files:**
- Modify: `server/terminal-registry.ts` (list method return type and mapping)

**Step 1: Add mode to list() return type and mapping**

Update the return type to include `mode`:

```typescript
list(): Array<{
  terminalId: string
  title: string
  description?: string
  mode: TerminalMode  // ADD THIS LINE
  resumeSessionId?: string
  createdAt: number
  lastActivityAt: number
  status: 'running' | 'exited'
  hasClients: boolean
  cwd?: string
}> {
  return Array.from(this.terminals.values()).map((t) => ({
    terminalId: t.terminalId,
    title: t.title,
    description: t.description,
    mode: t.mode,  // ADD THIS LINE
    resumeSessionId: t.resumeSessionId,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    status: t.status,
    hasClients: t.clients.size > 0,
    cwd: t.cwd,
  }))
}
```

**Step 2: Commit**

```bash
git add server/terminal-registry.ts
git commit -m "feat: include mode in terminal.list response

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Refactor Sidebar to session-centric model

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Update UnifiedItem to be session-focused**

Replace the `UnifiedItem` interface (lines 11-24):

```typescript
interface SessionItem {
  id: string
  sessionId: string
  title: string
  subtitle?: string
  projectPath?: string
  projectColor?: string
  timestamp: number
  cwd?: string
  // Running state (derived from terminals)
  isRunning: boolean
  runningTerminalId?: string
}
```

**Step 2: Build session list with running state**

Replace the `unifiedItems` useMemo (lines 91-131) with logic that:
1. Builds a map of sessionId → running terminalId from claude terminals
2. Only includes sessions (not terminals)
3. Decorates sessions with running state

```typescript
// Build unified list - sessions only, with running state from terminals
const sessionItems = useMemo(() => {
  const items: SessionItem[] = []
  const terminalsArray = terminals ?? []
  const projectsArray = projects ?? []

  // Build map: sessionId -> running terminalId
  const runningSessionMap = new Map<string, string>()
  terminalsArray.forEach((t) => {
    if (t.mode === 'claude' && t.status === 'running' && t.resumeSessionId) {
      runningSessionMap.set(t.resumeSessionId, t.terminalId)
    }
  })

  // Add sessions with running state
  projectsArray.forEach((project) => {
    project.sessions.forEach((session) => {
      const runningTerminalId = runningSessionMap.get(session.sessionId)
      items.push({
        id: `session-${session.sessionId}`,
        sessionId: session.sessionId,
        title: session.title || session.sessionId.slice(0, 8),
        subtitle: getProjectName(project.projectPath),
        projectPath: project.projectPath,
        projectColor: project.color,
        timestamp: session.updatedAt,
        cwd: session.cwd,
        isRunning: !!runningTerminalId,
        runningTerminalId,
      })
    })
  })

  return items
}, [terminals, projects])
```

**Step 3: Update filtering to use sessionItems**

```typescript
const filteredItems = useMemo(() => {
  if (!filter.trim()) return sessionItems
  const q = filter.toLowerCase()
  return sessionItems.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle?.toLowerCase().includes(q) ||
      item.projectPath?.toLowerCase().includes(q)
  )
}, [sessionItems, filter])
```

**Step 4: Update sorting logic**

Replace the sorting logic to work with sessions:

```typescript
const sortedItems = useMemo(() => {
  const sortMode = settings.sidebar?.sortMode || 'hybrid'
  const items = [...filteredItems]

  if (sortMode === 'recency') {
    return items.sort((a, b) => b.timestamp - a.timestamp)
  }

  if (sortMode === 'activity') {
    return items.sort((a, b) => {
      if (a.isRunning && !b.isRunning) return -1
      if (!a.isRunning && b.isRunning) return 1
      return b.timestamp - a.timestamp
    })
  }

  if (sortMode === 'project') {
    return items.sort((a, b) => {
      const projA = a.projectPath || a.subtitle || ''
      const projB = b.projectPath || b.subtitle || ''
      if (projA !== projB) return projA.localeCompare(projB)
      return b.timestamp - a.timestamp
    })
  }

  // Hybrid: running sessions first, then recency
  const running = items.filter((i) => i.isRunning)
  const rest = items.filter((i) => !i.isRunning)
  running.sort((a, b) => b.timestamp - a.timestamp)
  rest.sort((a, b) => b.timestamp - a.timestamp)
  return [...running, ...rest]
}, [filteredItems, settings.sidebar?.sortMode])
```

**Step 5: Update running/other separation for hybrid mode**

```typescript
const runningSessions = sortedItems.filter((i) => i.isRunning)
const otherItems = settings.sidebar?.sortMode === 'hybrid'
  ? sortedItems.filter((i) => !i.isRunning)
  : sortedItems
```

**Step 6: Update handleItemClick**

```typescript
const handleItemClick = (item: SessionItem) => {
  if (item.isRunning && item.runningTerminalId) {
    // Session is running - switch to existing terminal
    const existingTab = tabs.find((t) => t.terminalId === item.runningTerminalId)
    if (existingTab) {
      dispatch(setActiveTab(existingTab.id))
    } else {
      // Attach to the running terminal
      dispatch(addTab({
        title: item.title,
        terminalId: item.runningTerminalId,
        status: 'running',
        mode: 'claude'
      }))
    }
  } else {
    // Session not running - resume it
    dispatch(addTab({
      title: item.title,
      mode: 'claude',
      initialCwd: item.cwd,
      resumeSessionId: item.sessionId
    }))
  }
  onNavigate('terminal')
}
```

**Step 7: Update rendering to use runningSessions**

Replace `runningTerminals` with `runningSessions` in the JSX:

```tsx
{/* Running sessions section (hybrid mode) */}
{settings.sidebar?.sortMode === 'hybrid' && runningSessions.length > 0 && (
  <div className="mb-3">
    <div className="px-2 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wider">
      Running
    </div>
    <div className="space-y-0.5">
      {runningSessions.map((item) => (
        <SidebarItem
          key={item.id}
          item={item}
          isActiveTab={item.runningTerminalId === tabs.find((t) => t.id === activeTabId)?.terminalId}
          showProjectBadge={settings.sidebar?.showProjectBadges}
          onClick={() => handleItemClick(item)}
        />
      ))}
    </div>
  </div>
)}
```

**Step 8: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "refactor: make sidebar session-centric

Sessions are now the primary entity. Running Claude terminals
decorate their associated session with a play icon.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update SidebarItem component for session-centric display

**Files:**
- Modify: `src/components/Sidebar.tsx` (SidebarItem component)

**Step 1: Update SidebarItem props and rendering**

Replace the SidebarItem component:

```tsx
function SidebarItem({
  item,
  isActiveTab,
  showProjectBadge,
  onClick,
}: {
  item: SessionItem
  isActiveTab?: boolean
  showProjectBadge?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors group',
        isActiveTab
          ? 'bg-muted'
          : 'hover:bg-muted/50'
      )}
    >
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {item.isRunning ? (
          <div className="relative">
            <Play className="h-2.5 w-2.5 fill-success text-success" />
            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-success/30 animate-pulse-subtle" />
          </div>
        ) : (
          <div
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: item.projectColor || '#6b7280' }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm truncate',
            isActiveTab ? 'font-medium' : ''
          )}>
            {item.title}
          </span>
        </div>
        {item.subtitle && showProjectBadge && (
          <div className="text-2xs text-muted-foreground truncate">
            {item.subtitle}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-2xs text-muted-foreground/60 flex-shrink-0">
        {formatRelativeTime(item.timestamp)}
      </span>
    </button>
  )
}
```

**Step 2: Remove Circle import, keep Play**

Update imports at top of file - remove `Circle` if no longer used:

```typescript
import { Terminal, History, Settings, LayoutGrid, Search, Plus, Play } from 'lucide-react'
```

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "refactor: update SidebarItem for session-centric display

Running sessions show a play icon with pulse animation.
Non-running sessions show project color square.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Handle isActiveTab for sessions

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Update isActiveTab logic in otherItems rendering**

The `isActiveTab` check needs to work for both running sessions (match terminal) and non-running sessions (match resumeSessionId on tab):

```tsx
{otherItems.map((item) => {
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isActive = item.isRunning
    ? item.runningTerminalId === activeTab?.terminalId
    : item.sessionId === activeTab?.resumeSessionId

  return (
    <SidebarItem
      key={item.id}
      item={item}
      isActiveTab={isActive}
      showProjectBadge={settings.sidebar?.showProjectBadges}
      onClick={() => handleItemClick(item)}
    />
  )
})}
```

**Step 2: Same update for runningSessions rendering**

```tsx
{runningSessions.map((item) => {
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isActive = item.runningTerminalId === activeTab?.terminalId

  return (
    <SidebarItem
      key={item.id}
      item={item}
      isActiveTab={isActive}
      showProjectBadge={settings.sidebar?.showProjectBadges}
      onClick={() => handleItemClick(item)}
    />
  )
})}
```

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "fix: correct isActiveTab logic for session items

Match by terminalId for running sessions, resumeSessionId for others.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Manual testing

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Test scenarios**

1. **No running sessions:** Sidebar should show sessions with project color squares
2. **Resume a session:** Click a session → should open terminal and session should show play icon
3. **Session shows running:** The resumed session should appear in "Running" section with green play icon
4. **Click running session:** Should switch to existing tab, not create new one
5. **Exit Claude:** After Claude exits, session should move back to "Recent" with color square
6. **Shell terminals:** Should not appear in sidebar (verify by creating shell-only tab)

**Step 3: Commit any fixes discovered during testing**

---

## Summary

This implementation:
1. Tracks `resumeSessionId` on terminal records (backend)
2. Exposes `mode` and `resumeSessionId` in `terminal.list` response
3. Refactors sidebar to show only sessions
4. Sessions display a green play icon when a running Claude terminal has matching `resumeSessionId`
5. Shell-only terminals are hidden from sidebar (accessible via tabs at top)
6. Brief gap for new Claude sessions until they save - acceptable tradeoff for simplicity
