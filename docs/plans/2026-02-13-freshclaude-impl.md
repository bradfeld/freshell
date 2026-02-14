# Freshclaude Client Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename Claude Web to freshclaude, add per-pane settings popover with model/permissions/display toggles, fix scroll preservation, fix permission status text, and add a new icon.

**Architecture:** Per-pane settings stored in `ClaudeChatPaneContent` (Redux + localStorage persistence). CSS-based hiding for scroll preservation. New `FreshclaudeSettings` popover component. New inline SVG icon component in `provider-icons.tsx`.

**Tech Stack:** React 18, Redux Toolkit, Tailwind CSS, shadcn/ui (Popover), Vitest, Testing Library

---

### Task 1: Rename "Claude Web" → "freshclaude" (text only)

**Files:**
- Modify: `src/lib/derivePaneTitle.ts:20-22`
- Modify: `src/components/panes/PanePicker.tsx:79`
- Modify: `src/components/claude-chat/ClaudeChatView.tsx:140,161`
- Modify: `src/components/panes/PaneContainer.tsx:518`
- Test: `test/unit/client/lib/derivePaneTitle.test.ts`

**Step 1: Update the existing test expectation and add a claude-chat test**

In `test/unit/client/lib/derivePaneTitle.test.ts`, add:

```typescript
it('returns "freshclaude" for claude-chat content', () => {
  const content: PaneContent = {
    kind: 'claude-chat',
    createRequestId: 'test',
    status: 'idle',
  }
  expect(derivePaneTitle(content)).toBe('freshclaude')
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/client/lib/derivePaneTitle.test.ts`
Expected: FAIL — currently returns `'Claude Web'`

**Step 3: Update derivePaneTitle.ts**

In `src/lib/derivePaneTitle.ts:21`, change `'Claude Web'` to `'freshclaude'`.

**Step 4: Update PanePicker.tsx**

In `src/components/panes/PanePicker.tsx:79`, change `label: 'Claude Web'` to `label: 'freshclaude'`.

**Step 5: Update ClaudeChatView.tsx**

In `src/components/claude-chat/ClaudeChatView.tsx`:
- Line 140: Change `aria-label="Claude Web Chat"` to `aria-label="freshclaude Chat"`
- Line 161: Change `Claude Web Chat` to `freshclaude`

**Step 6: Update PaneContainer.tsx**

In `src/components/panes/PaneContainer.tsx:518`, change `'Claude Web'` to `'freshclaude'`.

**Step 7: Run tests to verify they pass**

Run: `npm test -- --run test/unit/client/lib/derivePaneTitle.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add src/lib/derivePaneTitle.ts src/components/panes/PanePicker.tsx src/components/claude-chat/ClaudeChatView.tsx src/components/panes/PaneContainer.tsx test/unit/client/lib/derivePaneTitle.test.ts
git commit -m "feat: rename Claude Web to freshclaude in all user-facing text"
```

---

### Task 2: Add per-pane settings fields to ClaudeChatPaneContent

**Files:**
- Modify: `src/store/paneTypes.ts:64-76`

**Step 1: Add new optional fields to ClaudeChatPaneContent**

In `src/store/paneTypes.ts`, update the `ClaudeChatPaneContent` type:

```typescript
export type ClaudeChatPaneContent = {
  kind: 'claude-chat'
  /** SDK session ID (undefined until created) */
  sessionId?: string
  /** Idempotency key for sdk.create */
  createRequestId: string
  /** Current status — uses SdkSessionStatus, not TerminalStatus */
  status: SdkSessionStatus
  /** Claude session to resume */
  resumeSessionId?: string
  /** Working directory */
  initialCwd?: string
  /** Model to use (default: claude-opus-4-6) */
  model?: string
  /** Permission mode (default: dangerouslySkipPermissions) */
  permissionMode?: string
  /** Show thinking blocks in message feed (default: true) */
  showThinking?: boolean
  /** Show tool-use blocks in message feed (default: true) */
  showTools?: boolean
  /** Show timestamps on messages (default: false) */
  showTimecodes?: boolean
  /** Whether the user has dismissed the first-launch settings popover */
  settingsDismissed?: boolean
}
```

**Step 2: Run full test suite to verify no breakage**

Run: `npm test -- --run`
Expected: PASS (new fields are all optional, no breaking changes)

**Step 3: Commit**

```bash
git add src/store/paneTypes.ts
git commit -m "feat: add settings fields to ClaudeChatPaneContent (model, permissions, display toggles)"
```

---

### Task 3: Pass model and permissionMode defaults in sdk.create

**Files:**
- Modify: `src/components/claude-chat/ClaudeChatView.tsx:66-84`

**Step 1: Add defaults constants and pass them in sdk.create**

At the top of `ClaudeChatView.tsx`, add constants:

```typescript
const DEFAULT_MODEL = 'claude-opus-4-6'
const DEFAULT_PERMISSION_MODE = 'dangerouslySkipPermissions'
```

In the `sdk.create` effect (around line 71), update the `ws.send` call to include model and permissionMode from pane content, falling back to defaults:

```typescript
ws.send({
  type: 'sdk.create',
  requestId: paneContent.createRequestId,
  model: paneContent.model ?? DEFAULT_MODEL,
  permissionMode: paneContent.permissionMode ?? DEFAULT_PERMISSION_MODE,
  ...(paneContent.initialCwd ? { cwd: paneContent.initialCwd } : {}),
  ...(paneContent.resumeSessionId ? { resumeSessionId: paneContent.resumeSessionId } : {}),
})
```

**Step 2: Run tests to verify no breakage**

Run: `npm test -- --run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/claude-chat/ClaudeChatView.tsx
git commit -m "feat: default freshclaude to opus 4.6 and dangerouslySkipPermissions"
```

---

### Task 4: Create freshclaude icon

**Files:**
- Create: `assets/icons/freshclaude.svg`
- Modify: `src/components/icons/provider-icons.tsx`
- Modify: `src/components/icons/PaneIcon.tsx`
- Modify: `src/components/panes/PanePicker.tsx:8,79`
- Test: `test/unit/client/components/icons/PaneIcon.test.tsx`

**Step 1: Write failing test for claude-chat icon**

In `test/unit/client/components/icons/PaneIcon.test.tsx`, add:

```typescript
it('renders freshclaude icon for claude-chat panes', () => {
  render(
    <PaneIcon
      content={{
        kind: 'claude-chat',
        createRequestId: 'req-1',
        status: 'idle',
      }}
    />
  )
  expect(screen.getByTestId('freshclaude-icon')).toBeInTheDocument()
})
```

Update the mock at top of file to include the new export:

```typescript
vi.mock('@/components/icons/provider-icons', () => ({
  ProviderIcon: ({ provider, ...props }: any) => (
    <svg data-testid={`provider-icon-${provider}`} {...props} />
  ),
  FreshclaudeIcon: (props: any) => (
    <svg data-testid="freshclaude-icon" {...props} />
  ),
}))
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/client/components/icons/PaneIcon.test.tsx`
Expected: FAIL — no `claude-chat` handler in PaneIcon

**Step 3: Create the freshclaude SVG**

Create `assets/icons/freshclaude.svg` — a Claude sparkle inside a speech bubble:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2C6.48 2 2 5.58 2 10c0 2.48 1.3 4.7 3.33 6.22V20l2.78-1.54C9.33 18.8 10.63 19 12 19c5.52 0 10-3.58 10-8S17.52 2 12 2Z"/>
  <path d="M12 6.5 13.09 9.26 16 9.64 13.95 11.54 14.47 14.5 12 13.09 9.53 14.5 10.05 11.54 8 9.64 10.91 9.26Z" fill="var(--background, #fff)"/>
</svg>
```

**Step 4: Add FreshclaudeIcon component to provider-icons.tsx**

In `src/components/icons/provider-icons.tsx`, add before `DefaultProviderIcon`:

```typescript
export function FreshclaudeIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M12 2C6.48 2 2 5.58 2 10c0 2.48 1.3 4.7 3.33 6.22V20l2.78-1.54C9.33 18.8 10.63 19 12 19c5.52 0 10-3.58 10-8S17.52 2 12 2Z"/>
      <path d="M12 6.5 13.09 9.26 16 9.64 13.95 11.54 14.47 14.5 12 13.09 9.53 14.5 10.05 11.54 8 9.64 10.91 9.26Z" fill="var(--background, #1a1a2e)"/>
    </svg>
  )
}
```

**Step 5: Add claude-chat case to PaneIcon.tsx**

In `src/components/icons/PaneIcon.tsx`, add import and handler:

```typescript
import { ProviderIcon, FreshclaudeIcon } from '@/components/icons/provider-icons'
```

Add before the `// Picker` fallback:

```typescript
if (content.kind === 'claude-chat') {
  return <FreshclaudeIcon className={className} />
}
```

**Step 6: Update PanePicker.tsx to use the new icon**

In `src/components/panes/PanePicker.tsx`:
- Change import: `import freshclaudeIconUrl from '../../../assets/icons/freshclaude.svg'`
- Update the option: `iconUrl: freshclaudeIconUrl`

**Step 7: Run tests to verify they pass**

Run: `npm test -- --run test/unit/client/components/icons/PaneIcon.test.tsx`
Expected: PASS

**Step 8: Commit**

```bash
git add assets/icons/freshclaude.svg src/components/icons/provider-icons.tsx src/components/icons/PaneIcon.tsx src/components/panes/PanePicker.tsx test/unit/client/components/icons/PaneIcon.test.tsx
git commit -m "feat: add freshclaude icon for claude-chat panes in tabs and pane headers"
```

---

### Task 5: Fix scroll preservation (CSS hiding + smart auto-scroll)

**Files:**
- Modify: `src/components/claude-chat/ClaudeChatView.tsx`

**Step 1: Replace `if (hidden) return null` with CSS-based hiding**

In `ClaudeChatView.tsx`, remove the line `if (hidden) return null` (line 133).

Wrap the outer `<div>` with the `tab-hidden`/`tab-visible` pattern:

```typescript
return (
  <div className={cn('h-full w-full flex flex-col', hidden ? 'tab-hidden' : 'tab-visible')} role="region" aria-label="freshclaude Chat">
```

**Step 2: Replace naive auto-scroll with smart auto-scroll**

Replace the auto-scroll effect (lines 105-108):

```typescript
// Smart auto-scroll: only scroll if user is already at/near the bottom
const scrollContainerRef = useRef<HTMLDivElement>(null)
const isAtBottomRef = useRef(true)

const handleScroll = useCallback(() => {
  const el = scrollContainerRef.current
  if (!el) return
  const threshold = 50
  isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}, [])

useEffect(() => {
  if (isAtBottomRef.current) {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
}, [session?.messages.length, session?.streamingActive])
```

Add `ref={scrollContainerRef}` and `onScroll={handleScroll}` to the message area div (line 158):

```typescript
<div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
```

**Step 3: Run tests to verify no breakage**

Run: `npm test -- --run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/claude-chat/ClaudeChatView.tsx
git commit -m "fix: preserve scroll position in freshclaude when navigating away and back"
```

---

### Task 6: Fix "Waiting for answer..." status when permissions are pending

**Files:**
- Modify: `src/components/claude-chat/ClaudeChatView.tsx:142-155,210`

**Step 1: Update status bar to show "Waiting for answer..." when permissions are pending**

Move `pendingPermissions` computation before the status bar JSX (it's already at line 137).

Update the status bar span to check for pending permissions:

```typescript
<span>
  {pendingPermissions.length > 0 && 'Waiting for answer...'}
  {pendingPermissions.length === 0 && paneContent.status === 'creating' && 'Creating session...'}
  {pendingPermissions.length === 0 && paneContent.status === 'starting' && 'Starting Claude Code...'}
  {pendingPermissions.length === 0 && paneContent.status === 'connected' && 'Connected'}
  {pendingPermissions.length === 0 && paneContent.status === 'running' && 'Running...'}
  {pendingPermissions.length === 0 && paneContent.status === 'idle' && 'Ready'}
  {pendingPermissions.length === 0 && paneContent.status === 'compacting' && 'Compacting context...'}
  {pendingPermissions.length === 0 && paneContent.status === 'exited' && 'Session ended'}
</span>
```

**Step 2: Update the composer placeholder similarly**

Change the placeholder logic (line 210):

```typescript
placeholder={
  pendingPermissions.length > 0
    ? 'Waiting for answer...'
    : isInteractive
      ? 'Message Claude...'
      : 'Waiting for connection...'
}
```

**Step 3: Run tests to verify no breakage**

Run: `npm test -- --run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/claude-chat/ClaudeChatView.tsx
git commit -m "fix: show 'Waiting for answer...' when permission prompt is pending"
```

---

### Task 7: Create FreshclaudeSettings popover component

**Files:**
- Create: `src/components/claude-chat/FreshclaudeSettings.tsx`
- Test: `test/unit/client/components/claude-chat/FreshclaudeSettings.test.tsx`

**Step 1: Write the failing test**

Create `test/unit/client/components/claude-chat/FreshclaudeSettings.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import FreshclaudeSettings from '@/components/claude-chat/FreshclaudeSettings'

describe('FreshclaudeSettings', () => {
  afterEach(cleanup)

  const defaults = {
    model: 'claude-opus-4-6',
    permissionMode: 'dangerouslySkipPermissions',
    showThinking: true,
    showTools: true,
    showTimecodes: false,
  }

  it('renders the settings gear button', () => {
    render(
      <FreshclaudeSettings
        {...defaults}
        sessionStarted={false}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('opens popover when gear button is clicked', () => {
    render(
      <FreshclaudeSettings
        {...defaults}
        sessionStarted={false}
        onChange={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('Permissions')).toBeInTheDocument()
  })

  it('disables model and permission dropdowns when session has started', () => {
    render(
      <FreshclaudeSettings
        {...defaults}
        sessionStarted={true}
        defaultOpen={true}
        onChange={vi.fn()}
      />
    )
    const modelSelect = screen.getByLabelText('Model')
    expect(modelSelect).toBeDisabled()
  })

  it('calls onChange when a toggle is changed', () => {
    const onChange = vi.fn()
    render(
      <FreshclaudeSettings
        {...defaults}
        sessionStarted={false}
        defaultOpen={true}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('switch', { name: /show timecodes/i }))
    expect(onChange).toHaveBeenCalledWith({ showTimecodes: true })
  })

  it('opens automatically when defaultOpen is true', () => {
    render(
      <FreshclaudeSettings
        {...defaults}
        sessionStarted={false}
        defaultOpen={true}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Model')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/unit/client/components/claude-chat/FreshclaudeSettings.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement FreshclaudeSettings component**

Create `src/components/claude-chat/FreshclaudeSettings.tsx`:

```typescript
import { useCallback, useState } from 'react'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FreshclaudeSettingsProps {
  model: string
  permissionMode: string
  showThinking: boolean
  showTools: boolean
  showTimecodes: boolean
  sessionStarted: boolean
  defaultOpen?: boolean
  onChange: (changes: Record<string, unknown>) => void
  onDismiss?: () => void
}

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

const PERMISSION_OPTIONS = [
  { value: 'dangerouslySkipPermissions', label: 'Skip permissions' },
  { value: 'default', label: 'Default (ask)' },
]

export default function FreshclaudeSettings({
  model,
  permissionMode,
  showThinking,
  showTools,
  showTimecodes,
  sessionStarted,
  defaultOpen = false,
  onChange,
  onDismiss,
}: FreshclaudeSettingsProps) {
  const [open, setOpen] = useState(defaultOpen)

  const handleClose = useCallback(() => {
    setOpen(false)
    onDismiss?.()
  }, [onDismiss])

  const handleToggle = useCallback(() => {
    if (open) {
      handleClose()
    } else {
      setOpen(true)
    }
  }, [open, handleClose])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'p-1 rounded hover:bg-muted transition-colors',
          open && 'bg-muted'
        )}
        aria-label="Settings"
        aria-expanded={open}
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border bg-popover p-3 shadow-lg"
          role="dialog"
          aria-label="freshclaude settings"
        >
          <div className="space-y-3">
            {/* Model */}
            <div className="space-y-1">
              <label htmlFor="fc-model" className="text-xs font-medium">Model</label>
              <select
                id="fc-model"
                aria-label="Model"
                value={model}
                disabled={sessionStarted}
                onChange={(e) => onChange({ model: e.target.value })}
                className="w-full rounded border bg-background px-2 py-1 text-xs disabled:opacity-50"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Permission mode */}
            <div className="space-y-1">
              <label htmlFor="fc-permissions" className="text-xs font-medium">Permissions</label>
              <select
                id="fc-permissions"
                aria-label="Permissions"
                value={permissionMode}
                disabled={sessionStarted}
                onChange={(e) => onChange({ permissionMode: e.target.value })}
                className="w-full rounded border bg-background px-2 py-1 text-xs disabled:opacity-50"
              >
                {PERMISSION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <hr className="border-border" />

            {/* Toggles */}
            <ToggleRow
              label="Show thinking"
              checked={showThinking}
              onChange={(v) => onChange({ showThinking: v })}
            />
            <ToggleRow
              label="Show tools"
              checked={showTools}
              onChange={(v) => onChange({ showTools: v })}
            />
            <ToggleRow
              label="Show timecodes"
              checked={showTimecodes}
              onChange={(v) => onChange({ showTimecodes: v })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <span
          className={cn(
            'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run test/unit/client/components/claude-chat/FreshclaudeSettings.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/claude-chat/FreshclaudeSettings.tsx test/unit/client/components/claude-chat/FreshclaudeSettings.test.tsx
git commit -m "feat: add FreshclaudeSettings popover component with model, permissions, display toggles"
```

---

### Task 8: Wire FreshclaudeSettings into ClaudeChatView

**Files:**
- Modify: `src/components/claude-chat/ClaudeChatView.tsx`

**Step 1: Import and add settings state**

Add import:

```typescript
import FreshclaudeSettings from './FreshclaudeSettings'
```

Add defaults at top:

```typescript
const DEFAULT_MODEL = 'claude-opus-4-6'
const DEFAULT_PERMISSION_MODE = 'dangerouslySkipPermissions'
```

**Step 2: Add settings change handler**

Inside the component, add:

```typescript
const handleSettingsChange = useCallback((changes: Record<string, unknown>) => {
  dispatch(updatePaneContent({
    tabId,
    paneId,
    content: { ...paneContentRef.current, ...changes },
  }))
}, [tabId, paneId, dispatch])

const handleSettingsDismiss = useCallback(() => {
  dispatch(updatePaneContent({
    tabId,
    paneId,
    content: { ...paneContentRef.current, settingsDismissed: true },
  }))
}, [tabId, paneId, dispatch])

const sessionStarted = Boolean(session?.messages.length)
```

**Step 3: Add settings gear to the status bar**

In the status bar div, add the settings component next to the cwd display:

```typescript
<div className="flex items-center justify-between px-3 py-1.5 border-b text-xs text-muted-foreground">
  <span>
    {/* status text */}
  </span>
  <div className="flex items-center gap-2">
    {paneContent.initialCwd && (
      <span className="truncate">{paneContent.initialCwd}</span>
    )}
    <FreshclaudeSettings
      model={paneContent.model ?? DEFAULT_MODEL}
      permissionMode={paneContent.permissionMode ?? DEFAULT_PERMISSION_MODE}
      showThinking={paneContent.showThinking ?? true}
      showTools={paneContent.showTools ?? true}
      showTimecodes={paneContent.showTimecodes ?? false}
      sessionStarted={sessionStarted}
      defaultOpen={!paneContent.settingsDismissed}
      onChange={handleSettingsChange}
      onDismiss={handleSettingsDismiss}
    />
  </div>
</div>
```

**Step 4: Pass display toggles to MessageBubble**

Update the `MessageBubble` renders to pass the display toggle props:

```typescript
<MessageBubble
  key={i}
  role={msg.role}
  content={msg.content}
  timestamp={msg.timestamp}
  model={msg.model}
  showThinking={paneContent.showThinking ?? true}
  showTools={paneContent.showTools ?? true}
  showTimecodes={paneContent.showTimecodes ?? false}
/>
```

Same for the streaming bubble (without timestamp/model).

**Step 5: Run tests to verify no breakage**

Run: `npm test -- --run`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/claude-chat/ClaudeChatView.tsx
git commit -m "feat: wire FreshclaudeSettings into ClaudeChatView status bar"
```

---

### Task 9: Update MessageBubble to respect display toggles

**Files:**
- Modify: `src/components/claude-chat/MessageBubble.tsx`

**Step 1: Add new props to MessageBubble**

Update the interface:

```typescript
interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: ChatContentBlock[]
  timestamp?: string
  model?: string
  showThinking?: boolean
  showTools?: boolean
  showTimecodes?: boolean
}
```

**Step 2: Filter content blocks based on toggles**

In the component, destructure the new props with defaults:

```typescript
function MessageBubble({ role, content, timestamp, model, showThinking = true, showTools = true, showTimecodes = false }: MessageBubbleProps) {
```

In the content rendering, wrap the thinking and tool blocks with their toggle conditions:

```typescript
if (block.type === 'thinking' && block.thinking) {
  if (!showThinking) return null
  // ... existing thinking render
}

if (block.type === 'tool_use' && block.name) {
  if (!showTools) return null
  // ... existing tool_use render
}

if (block.type === 'tool_result') {
  if (!showTools) return null
  // ... existing tool_result render
}
```

**Step 3: Conditionally show timestamp**

Update the timestamp display at the bottom:

```typescript
{((showTimecodes && timestamp) || model) && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
    {showTimecodes && timestamp && <time>{new Date(timestamp).toLocaleTimeString()}</time>}
    {model && <span className="opacity-60">{model}</span>}
  </div>
)}
```

**Step 4: Run tests to verify no breakage**

Run: `npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/claude-chat/MessageBubble.tsx
git commit -m "feat: MessageBubble respects showThinking, showTools, showTimecodes toggles"
```

---

### Task 10: Full test suite + verify build

**Step 1: Run full test suite**

Run: `npm run verify`
Expected: Build succeeds, all tests pass

**Step 2: Fix any issues found**

Address any type errors or test failures.

**Step 3: Final commit if needed**

```bash
git commit -m "fix: address test/build issues from freshclaude improvements"
```
