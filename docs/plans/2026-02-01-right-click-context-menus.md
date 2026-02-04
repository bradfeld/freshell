# Right Click Context Menus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a unified right-click (and long-press) context menu system across the Freshell UI, including session archive and metadata actions.

**Architecture:** Introduce a small, portal-based context menu layer driven by a root capture handler and data attributes, then map context targets to menu definitions that dispatch existing Redux actions or new helpers. Extend session metadata (archived, createdAt) end-to-end so the sidebar and search can sort archived sessions last and surface full metadata in JSON.

**Tech Stack:** React 18, Redux Toolkit, Vite, Tailwind CSS, Node/Express, Vitest, Testing Library

---

### Task 1: Add archived + createdAt to session models (server)

**Files:**
- Modify: `server/config-store.ts`
- Modify: `server/claude-indexer.ts`
- Modify: `server/session-search.ts`
- Modify: `server/index.ts`
- Test: `test/unit/server/config-store.test.ts`
- Test: `test/unit/server/session-search.test.ts`
- Test: `test/unit/server/claude-indexer.test.ts`

**Step 1: Write the failing test (config store persists archived)**

```ts
// test/unit/server/config-store.test.ts
it('stores session archived flag', async () => {
  const store = new ConfigStore()
  await store.patchSessionOverride('session-arch', { archived: true })
  const cfg = await store.load()
  expect(cfg.sessionOverrides['session-arch']?.archived).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:server -- config-store.test.ts`
Expected: FAIL with "archived does not exist" or property mismatch.

**Step 3: Write minimal implementation**

```ts
// server/config-store.ts
export type SessionOverride = {
  titleOverride?: string
  summaryOverride?: string
  deleted?: boolean
  archived?: boolean
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:server -- config-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/config-store.ts test/unit/server/config-store.test.ts
git commit -m "feat(sessions): persist archived flag in config"
```

---

**Step 6: Write the failing test (createdAt + archived in indexer merge)**

```ts
// test/unit/server/claude-indexer.test.ts
import { parseSessionContent } from '../../../server/claude-indexer.js'
import type { SessionOverride } from '../../../server/config-store.js'

it('applies archived flag and preserves createdAt', async () => {
  // Minimal shape: use applyOverride via exported helper (add export if needed)
  const session = {
    sessionId: 's1',
    projectPath: '/p',
    updatedAt: 2000,
    createdAt: 1000,
    title: 'Title',
  }
  const ov: SessionOverride = { archived: true }
  const merged = (globalThis as any).applyOverrideForTest(session, ov)
  expect(merged?.archived).toBe(true)
  expect(merged?.createdAt).toBe(1000)
})
```

**Step 7: Run test to verify it fails**

Run: `npm run test:server -- claude-indexer.test.ts`
Expected: FAIL (no createdAt/archived)

**Step 8: Write minimal implementation**

```ts
// server/claude-indexer.ts
export type ClaudeSession = {
  sessionId: string
  projectPath: string
  updatedAt: number
  createdAt: number
  messageCount?: number
  title?: string
  summary?: string
  cwd?: string
  archived?: boolean
}

function applyOverride(session: ClaudeSession, ov: SessionOverride | undefined): ClaudeSession | null {
  if (ov?.deleted) return null
  return {
    ...session,
    title: ov?.titleOverride || session.title,
    summary: ov?.summaryOverride || session.summary,
    archived: ov?.archived ?? false,
  }
}

// When constructing baseSession in refresh() and file upsert:
const baseSession: ClaudeSession = {
  sessionId,
  projectPath,
  updatedAt: stat.mtimeMs || stat.mtime.getTime(),
  createdAt: stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs || stat.mtime.getTime(),
  messageCount: meta.messageCount,
  title: meta.title,
  summary: meta.summary,
  cwd: meta.cwd,
}

// Export a tiny helper for tests only (or adjust tests to use public API)
export const applyOverrideForTest = applyOverride
```

**Step 9: Run test to verify it passes**

Run: `npm run test:server -- claude-indexer.test.ts`
Expected: PASS

**Step 10: Commit**

```bash
git add server/claude-indexer.ts test/unit/server/claude-indexer.test.ts
git commit -m "feat(sessions): add createdAt + archived to Claude sessions"
```

---

**Step 11: Write the failing test (archived sorted last in search)**

```ts
// test/unit/server/session-search.test.ts
it('sorts archived sessions after non-archived', () => {
  const projects: ProjectGroup[] = [
    {
      projectPath: '/p',
      sessions: [
        { sessionId: 'a', projectPath: '/p', updatedAt: 2000, createdAt: 1000, title: 'A', archived: true },
        { sessionId: 'b', projectPath: '/p', updatedAt: 1000, createdAt: 900, title: 'B', archived: false },
      ],
    },
  ]
  const results = searchTitleTier(projects, 'a')
  expect(results[results.length - 1].sessionId).toBe('a')
})
```

**Step 12: Run test to verify it fails**

Run: `npm run test:server -- session-search.test.ts`
Expected: FAIL (archived not sorted last)

**Step 13: Write minimal implementation**

```ts
// server/session-search.ts
export const SearchResultSchema = z.object({
  // ...existing...
  archived: z.boolean().optional(),
  createdAt: z.number().optional(),
})

// when pushing results
results.push({
  sessionId: session.sessionId,
  projectPath: session.projectPath,
  title: session.title,
  summary: session.summary,
  matchedIn: titleMatch ? 'title' : 'summary',
  snippet: titleMatch ? session.title : session.summary,
  updatedAt: session.updatedAt,
  createdAt: session.createdAt,
  archived: session.archived,
  cwd: session.cwd,
})

// sort helper
function sortWithArchived(a: SearchResult, b: SearchResult) {
  if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1
  return b.updatedAt - a.updatedAt
}

// use sortWithArchived in title tier + file search sort
results.sort(sortWithArchived)
```

**Step 14: Run test to verify it passes**

Run: `npm run test:server -- session-search.test.ts`
Expected: PASS

**Step 15: Commit**

```bash
git add server/session-search.ts test/unit/server/session-search.test.ts
git commit -m "feat(search): include archived/createdAt and sort archived last"
```

---

**Step 16: Extend session patch API to accept archived**

```ts
// server/index.ts
app.patch('/api/sessions/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId
  const { titleOverride, summaryOverride, deleted, archived } = req.body || {}
  const next = await configStore.patchSessionOverride(sessionId, {
    titleOverride,
    summaryOverride,
    deleted,
    archived,
  })
  await claudeIndexer.refresh()
  wsHandler.broadcast({ type: 'sessions.updated', projects: claudeIndexer.getProjects() })
  res.json(next)
})
```

**Step 17: Run tests**

Run: `npm run test:server -- index.ts`
Expected: PASS (or no tests; ensure lint/TS ok)

**Step 18: Commit**

```bash
git add server/index.ts
git commit -m "feat(api): allow session archived flag"
```

---

### Task 2: Update client session types + sorting + archive icon

**Files:**
- Modify: `src/store/types.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/store/selectors/sidebarSelectors.ts`
- Modify: `src/components/Sidebar.tsx`
- Test: `test/unit/client/store/sidebarSelectors.test.ts` (new)

**Step 1: Write the failing test (archived sorts last)**

```ts
// test/unit/client/store/sidebarSelectors.test.ts
import { describe, it, expect } from 'vitest'
import { makeSelectSortedSessionItems } from '@/store/selectors/sidebarSelectors'

it('puts archived sessions at the bottom', () => {
  const selector = makeSelectSortedSessionItems()
  const state: any = {
    sessions: { projects: [{ projectPath: '/p', sessions: [
      { sessionId: 'a', projectPath: '/p', updatedAt: 2000, createdAt: 1000, title: 'A', archived: true },
      { sessionId: 'b', projectPath: '/p', updatedAt: 1000, createdAt: 900, title: 'B', archived: false },
    ]}]},
    tabs: { tabs: [] },
    settings: { settings: { sidebar: { sortMode: 'recency' } } },
    sessionActivity: { sessions: {} },
  }
  const items = selector(state, [], '')
  expect(items[items.length - 1].sessionId).toBe('a')
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:client -- sidebarSelectors.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// src/store/types.ts
export interface ClaudeSession {
  sessionId: string
  projectPath: string
  updatedAt: number
  createdAt?: number
  messageCount?: number
  title?: string
  summary?: string
  cwd?: string
  archived?: boolean
}

// src/lib/api.ts
export type SearchResult = {
  // ...existing...
  createdAt?: number
  archived?: boolean
}

// src/store/selectors/sidebarSelectors.ts
export interface SidebarSessionItem {
  // ...existing...
  archived?: boolean
}

// when building items
archived: session.archived,

// sort helper
function splitArchived(items: SidebarSessionItem[]) {
  const active = items.filter((i) => !i.archived)
  const archived = items.filter((i) => i.archived)
  return { active, archived }
}

function sortSessionItems(items: SidebarSessionItem[], sortMode: string): SidebarSessionItem[] {
  const { active, archived } = splitArchived(items)
  const sortedActive = sortByMode(active, sortMode)
  const sortedArchived = sortByMode(archived, sortMode)
  return [...sortedActive, ...sortedArchived]
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:client -- sidebarSelectors.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/types.ts src/lib/api.ts src/store/selectors/sidebarSelectors.ts test/unit/client/store/sidebarSelectors.test.ts
git commit -m "feat(client): track archived sessions and sort last"
```

---

**Step 6: Add archive icon to sidebar rows**

```tsx
// src/components/Sidebar.tsx (inside SidebarItem)
import { Archive } from 'lucide-react'

{item.archived && (
  <Archive className="h-3 w-3 text-muted-foreground/70" title="Archived" />
)}
```

Run: `npm run test:client -- Sidebar.test.tsx` (if present) or `npm run test:client`
Expected: PASS

Commit:
```bash
git add src/components/Sidebar.tsx
git commit -m "feat(sidebar): show archived badge"
```

---

### Task 3: Session archive toggle + delete modal metadata

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/lib/api.ts`
- Create: `src/components/ui/confirm-modal.tsx`
- Modify: `src/App.tsx`
- Test: `test/unit/client/components/ConfirmModal.test.tsx` (new)

**Step 1: Write failing test for confirm modal**

```tsx
// test/unit/client/components/ConfirmModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmModal } from '@/components/ui/confirm-modal'

it('calls onConfirm when confirm is clicked', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmModal
      open
      title="Delete session"
      body={<div>Body</div>}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
  fireEvent.click(screen.getByText('Delete'))
  expect(onConfirm).toHaveBeenCalled()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:client -- ConfirmModal.test.tsx`
Expected: FAIL (missing component)

**Step 3: Implement modal (portal, backdrop, focus trap minimal)**

```tsx
// src/components/ui/confirm-modal.tsx
import { createPortal } from 'react-dom'

export function ConfirmModal({ open, title, body, confirmLabel, onConfirm, onCancel }: Props) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 text-sm text-muted-foreground">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="h-8 px-3 text-sm" onClick={onCancel}>Cancel</button>
          <button className="h-8 px-3 text-sm bg-destructive text-destructive-foreground rounded" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:client -- ConfirmModal.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ui/confirm-modal.tsx test/unit/client/components/ConfirmModal.test.tsx
git commit -m "feat(ui): add confirm modal component"
```

---

**Step 6: Wire archive toggle + delete modal in Sidebar**

- Add `archived` to `SessionItem` mapping (from session data/search results).
- Add an `onArchiveToggle` handler that calls `api.patch('/api/sessions/:id', { archived: !archived })`.
- Add `delete` action to open ConfirmModal; body includes summary, messageCount, createdAt, updatedAt.

Example body builder:

```tsx
const meta = {
  title: item.title,
  summary: session.summary,
  messageCount: session.messageCount,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
}
const body = (
  <div className="space-y-2">
    {meta.summary && <div className="text-xs">{meta.summary}</div>}
    <div className="text-xs">Messages: {meta.messageCount ?? 'unknown'}</div>
    <div className="text-xs">Created: {formatDate(meta.createdAt)}</div>
    <div className="text-xs">Last used: {formatDate(meta.updatedAt)}</div>
  </div>
)
```

Run: `npm run test:client -- Sidebar.test.tsx` (or full client suite)
Expected: PASS

Commit:
```bash
git add src/components/Sidebar.tsx src/lib/api.ts src/App.tsx
git commit -m "feat(sidebar): archive toggle and delete confirm modal"
```

---

### Task 4: Add context menu primitive

**Files:**
- Create: `src/components/context-menu/ContextMenu.tsx`
- Create: `src/components/context-menu/context-menu-utils.ts`
- Test: `test/unit/client/components/ContextMenu.test.tsx` (new)

**Step 1: Write failing test (opens at position + closes on Escape)**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextMenu } from '@/components/context-menu/ContextMenu'

it('renders menu at position and closes on Escape', () => {
  const onClose = vi.fn()
  render(
    <ContextMenu
      open
      position={{ x: 100, y: 200 }}
      items={[{ id: 'copy', label: 'Copy', onSelect: vi.fn() }]}
      onClose={onClose}
    />
  )
  expect(screen.getByText('Copy')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:client -- ContextMenu.test.tsx`
Expected: FAIL

**Step 3: Implement ContextMenu (portal + clamped position)**

```tsx
// src/components/context-menu/context-menu-utils.ts
export function clampToViewport(x: number, y: number, menuW: number, menuH: number) {
  const maxX = window.innerWidth - menuW - 8
  const maxY = window.innerHeight - menuH - 8
  return { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) }
}
```

```tsx
// src/components/context-menu/ContextMenu.tsx
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

export function ContextMenu({ open, position, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(position)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!open || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(clampToViewport(position.x, position.y, rect.width, rect.height))
  }, [open, position])

  if (!open) return null
  return createPortal(
    <div ref={ref} className="fixed z-50 min-w-[200px] rounded-md border bg-card shadow-lg" style={{ left: pos.x, top: pos.y }}>
      {items.map((item) => (
        <button key={item.id} onClick={() => { item.onSelect(); onClose() }} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:client -- ContextMenu.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/context-menu/ContextMenu.tsx src/components/context-menu/context-menu-utils.ts test/unit/client/components/ContextMenu.test.tsx
git commit -m "feat(ui): add context menu primitive"
```

---

### Task 5: Add context menu state + root capture

**Files:**
- Create: `src/components/context-menu/ContextMenuProvider.tsx`
- Modify: `src/App.tsx`
- Test: `test/unit/client/components/ContextMenuProvider.test.tsx` (new)

**Step 1: Write failing test (right click opens menu)**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextMenuProvider } from '@/components/context-menu/ContextMenuProvider'

it('opens menu on contextmenu event', () => {
  render(
    <ContextMenuProvider>
      <div data-context="global">Area</div>
    </ContextMenuProvider>
  )
  fireEvent.contextMenu(screen.getByText('Area'))
  expect(screen.getByText('New tab')).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:client -- ContextMenuProvider.test.tsx`
Expected: FAIL

**Step 3: Implement provider + capture logic**

```tsx
// ContextMenuProvider.tsx
const ContextMenuCtx = createContext({ openFromEvent: () => {} })

function findContextTarget(target: HTMLElement | null) {
  let node: HTMLElement | null = target
  while (node) {
    if (node.dataset.context) return { context: node.dataset.context, data: node.dataset }
    node = node.parentElement
  }
  return { context: 'global', data: {} }
}

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ContextMenuState | null>(null)

  const onContextMenuCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (shouldUseNativeMenu(target)) return
    e.preventDefault()
    const found = findContextTarget(target)
    setState({ position: { x: e.clientX, y: e.clientY }, ...found })
  }

  return (
    <div onContextMenuCapture={onContextMenuCapture}>
      {children}
      <ContextMenu open={!!state} ... />
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:client -- ContextMenuProvider.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/context-menu/ContextMenuProvider.tsx src/App.tsx test/unit/client/components/ContextMenuProvider.test.tsx
git commit -m "feat(ui): add context menu provider + root capture"
```

---

### Task 6: Wire context targets (data-context attributes)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TabBar.tsx`
- Modify: `src/components/TabItem.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/panes/Pane.tsx`
- Modify: `src/components/panes/PaneHeader.tsx`
- Modify: `src/components/panes/PaneDivider.tsx`
- Modify: `src/components/TerminalView.tsx`
- Modify: `src/components/panes/BrowserPane.tsx`
- Modify: `src/components/panes/EditorPane.tsx`
- Modify: `src/components/panes/PanePicker.tsx`

**Step 1: Add data-context markers with IDs**

Examples:

```tsx
// TabItem
<div data-context="tab" data-tab-id={tab.id} ...>

// Tab bar empty area
<div data-context="tabbar" className="flex ...">

// Add tab button
<button data-context="tab-add">...

// Pane header
<div data-context="pane" data-pane-id={paneId} data-tab-id={tabId} ...>

// Sidebar row
<button data-context="sidebar-session" data-session-id={item.sessionId} ...>
```

**Step 2: Run relevant tests**

Run: `npm run test:client -- TabBar.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add src/App.tsx src/components/TabBar.tsx src/components/TabItem.tsx src/components/Sidebar.tsx src/components/panes/Pane.tsx src/components/panes/PaneHeader.tsx src/components/panes/PaneDivider.tsx src/components/TerminalView.tsx src/components/panes/BrowserPane.tsx src/components/panes/EditorPane.tsx src/components/panes/PanePicker.tsx
git commit -m "feat(ui): add context menu data attributes"
```

---

### Task 7: Implement menu definitions + actions (global/tab/pane/session)

**Files:**
- Create: `src/components/context-menu/menu-defs.ts`
- Modify: `src/App.tsx`
- Modify: `src/store/tabsSlice.ts`
- Modify: `src/store/panesSlice.ts`
- Modify: `src/lib/session-utils.ts` (optional helper)
- Test: `test/unit/client/components/ContextMenuActions.test.tsx` (new)

**Step 1: Write failing test (copy all tab names)**

```tsx
it('copies all tab names', async () => {
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  // render App or context menu with tabs state
  // trigger menu action
  expect(clipboard).toHaveBeenCalledWith('Tab 1\nTab 2')
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:client -- ContextMenuActions.test.tsx`
Expected: FAIL

**Step 3: Implement menu defs**

```ts
// menu-defs.ts
export function getMenuItems(ctx: ContextTarget, app: AppActions, state: RootState): MenuItem[] {
  switch (ctx.context) {
    case 'global':
    case 'tabbar':
    case 'header':
      return [
        { id: 'new-tab', label: 'New tab', onSelect: () => app.newDefaultTab() },
        { id: 'copy-tabs', label: 'Copy all tab names', onSelect: () => app.copyTabNames() },
        { id: 'toggle-sidebar', label: `${app.sidebarOpen ? 'Close' : 'Open'} menu`, onSelect: app.toggleSidebar },
        { id: 'copy-link', label: 'Copy freshell token link', onSelect: app.copyShareLink },
        ...app.viewTargets.filter((v) => v.id !== app.currentView).map((v) => ({
          id: `open-${v.id}`,
          label: `Open ${v.label}`,
          onSelect: () => app.openView(v.id),
        })),
      ]
    case 'tab':
      return [
        { id: 'copy-tab', label: 'Copy tab name', onSelect: () => app.copyTabName(ctx.tabId) },
        { id: 'close-others', label: 'Close all but this tab', onSelect: () => app.closeOtherTabs(ctx.tabId) },
        { id: 'move-left', label: 'Move tab left', onSelect: () => app.moveTab(ctx.tabId, -1) },
        { id: 'move-right', label: 'Move tab right', onSelect: () => app.moveTab(ctx.tabId, 1) },
      ]
    // ...other contexts
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:client -- ContextMenuActions.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/context-menu/menu-defs.ts src/App.tsx src/store/tabsSlice.ts src/store/panesSlice.ts test/unit/client/components/ContextMenuActions.test.tsx
git commit -m "feat(context-menu): add menu definitions and actions"
```

---

### Task 8: New tab with pane type + open in new tab / this tab

**Files:**
- Modify: `src/store/tabsSlice.ts`
- Modify: `src/store/panesSlice.ts`
- Modify: `src/components/Sidebar.tsx`
- Test: `test/unit/client/store/tabsSlice.test.ts` (new)

**Step 1: Write failing test (force new tab even if session exists)**

```ts
import tabsReducer, { addTab } from '@/store/tabsSlice'

it('allows opening duplicate session when forceNew is true', () => {
  const state = { tabs: [], activeTabId: null }
  const s1 = tabsReducer(state as any, addTab({ resumeSessionId: 's1' } as any))
  const s2 = tabsReducer(s1 as any, addTab({ resumeSessionId: 's1', forceNew: true } as any))
  expect(s2.tabs.length).toBe(2)
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:client -- tabsSlice.test.ts`
Expected: FAIL

**Step 3: Implement forceNew and addTabWithPane**

```ts
// tabsSlice.ts
addTab: (state, action: PayloadAction<AddTabPayload | undefined>) => {
  const payload = action.payload || {}
  if (payload.resumeSessionId && !payload.forceNew) { /* existing dedupe */ }
  // ...
}

// new thunk
export const addTabWithPane = createAsyncThunk(
  'tabs/addTabWithPane',
  async (payload: { pane: PaneContentInput; tab?: AddTabPayload }, { dispatch }) => {
    const id = nanoid()
    dispatch(addTab({ ...payload.tab, id } as any))
    dispatch(initLayout({ tabId: id, content: payload.pane }))
  }
)
```

**Step 4: Run test to verify it passes**

Run: `npm run test:client -- tabsSlice.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/tabsSlice.ts src/store/panesSlice.ts test/unit/client/store/tabsSlice.test.ts

git commit -m "feat(tabs): support forceNew and addTabWithPane"
```

---

### Task 9: Copy full metadata JSON (sidebar session menu)

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/lib/clipboard.ts` (new helper)
- Test: `test/unit/client/components/SidebarMetadata.test.tsx` (new)

**Step 1: Write failing test**

```tsx
it('copies full metadata JSON', async () => {
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  // render Sidebar with one session, trigger menu action
  const json = JSON.parse(clipboard.mock.calls[0][0] as string)
  expect(json.sessionId).toBe('session-1')
  expect(json.cwd).toBe('/proj')
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:client -- SidebarMetadata.test.tsx`
Expected: FAIL

**Step 3: Implement metadata builder**

```ts
const metadata = {
  title: item.title,
  sessionId: item.sessionId,
  projectPath: item.projectPath,
  cwd: item.cwd,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  messageCount: session.messageCount,
  summary: session.summary,
  archived: session.archived,
  hasTab: item.hasTab,
  isRunning: item.isRunning,
  runningTerminalId: item.runningTerminalId,
  projectColor: item.projectColor,
  tabLastInputAt: item.tabLastInputAt,
}
await navigator.clipboard.writeText(JSON.stringify(metadata, null, 2))
```

**Step 4: Run test to verify it passes**

Run: `npm run test:client -- SidebarMetadata.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/lib/clipboard.ts test/unit/client/components/SidebarMetadata.test.tsx
git commit -m "feat(sidebar): copy full session metadata JSON"
```

---

### Task 10: Final context menu wiring for all contexts

**Files:**
- Modify: `src/components/context-menu/menu-defs.ts`
- Modify: `src/components/TabBar.tsx`
- Modify: `src/components/panes/Pane.tsx`
- Modify: `src/components/panes/PaneDivider.tsx`
- Modify: `src/components/TerminalView.tsx`
- Modify: `src/components/panes/BrowserPane.tsx`
- Modify: `src/components/panes/EditorPane.tsx`
- Modify: `src/components/panes/PanePicker.tsx`
- Modify: `src/components/HistoryView.tsx`
- Modify: `src/components/OverviewView.tsx`
- Modify: `src/components/ClaudeSessionView.tsx`

**Step 1: Map each context to the edited menu list**

- Global/header/tabbar -> items from list 1
- Tab item -> items from list 4
- Add tab button -> items from list 5
- Pane header -> Rename pane
- Pane divider -> Reset/Swap
- Terminal pane -> list 8 (no kill)
- Browser toolbar -> list 9
- Browser iframe -> native only (no custom menu)
- Editor pane -> list 11
- Pane picker -> Close pane
- Sidebar session row -> list 16 including Copy full metadata
- History/Overview/Claude -> list 17-20

**Step 2: Run tests**

Run: `npm run test:client`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/context-menu/menu-defs.ts src/components/TabBar.tsx src/components/panes/Pane.tsx src/components/panes/PaneDivider.tsx src/components/TerminalView.tsx src/components/panes/BrowserPane.tsx src/components/panes/EditorPane.tsx src/components/panes/PanePicker.tsx src/components/HistoryView.tsx src/components/OverviewView.tsx src/components/ClaudeSessionView.tsx
git commit -m "feat(context-menu): wire menu actions across UI"
```

---

### Task 11: Polishing + responsive long-press

**Files:**
- Modify: `src/components/context-menu/ContextMenuProvider.tsx`
- Modify: `src/components/context-menu/ContextMenu.tsx`
- Test: `test/unit/client/components/ContextMenuMobile.test.tsx` (new)

**Step 1: Write failing test (long press opens menu)**

```tsx
it('opens menu on long press for touch', () => {
  // simulate pointerdown with pointerType=touch and advance timers
})
```

**Step 2: Implement long-press handler**

```ts
const LONG_PRESS_MS = 500
onPointerDown -> setTimeout(open)
onPointerUp/Move -> clearTimeout
```

**Step 3: Run tests**

Run: `npm run test:client -- ContextMenuMobile.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/context-menu/ContextMenuProvider.tsx src/components/context-menu/ContextMenu.tsx test/unit/client/components/ContextMenuMobile.test.tsx
git commit -m "feat(context-menu): add long-press support"
```

---

### Task 12: Documentation update (optional)

**Files:**
- Modify: `docs/README` or `README.md`

Add a short note about right-click menus and archive behavior.

Commit:
```bash
git add README.md
git commit -m "docs: describe context menus and archive"
```

---

Plan complete and saved to `docs/plans/2026-02-01-right-click-context-menus.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
