# Claude Session Auto-Association Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When Claude creates a new session, automatically associate it with the running terminal so it can be resumed after server restart.

**Architecture:** The indexer detects new session files and matches them to unassociated claude-mode terminals by cwd. The association is stored in the terminal record (server) and pane content (client), persisted to localStorage. On server restart, the client sends `resumeSessionId` when recreating the terminal.

**Tech Stack:** TypeScript, Vitest, WebSocket messages, Redux

---

## Background

When a user creates a new Claude tab (not resuming from history), the terminal has no `resumeSessionId`. Claude starts fresh and creates its own session file in `~/.claude/projects/*/sessions/*.jsonl`. Previously, CWD-based matching allowed the system to infer the association, but this was removed in commit `5373c86` to fix cross-terminal title contamination.

The fix: detect new sessions at creation time, associate once with matching terminal, store explicitly.

**Key Design Decision:** When multiple terminals match the same cwd, associate only the OLDEST unassociated terminal (by `createdAt`). This prevents incorrect associations when multiple Claude terminals are open in the same directory.

---

## Task 1: Add `findUnassociatedClaudeTerminals` to TerminalRegistry

**Files:**
- Modify: `server/terminal-registry.ts` (after `findClaudeTerminalsBySession` method)
- Test: `test/unit/server/terminal-registry.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/server/terminal-registry.test.ts`:

```typescript
describe('findUnassociatedClaudeTerminals', () => {
  it('should find claude terminals without resumeSessionId matching cwd', () => {
    const registry = new TerminalRegistry()

    // Create a claude terminal without resumeSessionId
    const term1 = registry.create({ mode: 'claude', cwd: '/home/user/project' })
    // Create a claude terminal WITH resumeSessionId (should not match)
    const term2 = registry.create({ mode: 'claude', cwd: '/home/user/project', resumeSessionId: 'existing-session' })
    // Create a shell terminal (should not match)
    const term3 = registry.create({ mode: 'shell', cwd: '/home/user/project' })

    const results = registry.findUnassociatedClaudeTerminals('/home/user/project')

    expect(results).toHaveLength(1)
    expect(results[0].terminalId).toBe(term1.terminalId)
  })

  it('should return empty array when no matching terminals', () => {
    const registry = new TerminalRegistry()
    registry.create({ mode: 'claude', cwd: '/other/path' })

    const results = registry.findUnassociatedClaudeTerminals('/home/user/project')

    expect(results).toHaveLength(0)
  })

  it('should match cwd case-insensitively on Windows', () => {
    const registry = new TerminalRegistry()
    const term = registry.create({ mode: 'claude', cwd: 'C:\\Users\\Dan\\project' })

    const results = registry.findUnassociatedClaudeTerminals('c:/users/dan/project')

    // On Windows, paths are case-insensitive
    // On Unix, this test would fail (which is correct behavior)
    if (process.platform === 'win32') {
      expect(results).toHaveLength(1)
      expect(results[0].terminalId).toBe(term.terminalId)
    } else {
      // Unix: different case = different path
      expect(results).toHaveLength(0)
    }
  })

  it('should normalize backslashes to forward slashes', () => {
    const registry = new TerminalRegistry()
    const term = registry.create({ mode: 'claude', cwd: 'C:\\Users\\Dan\\project' })

    const results = registry.findUnassociatedClaudeTerminals('C:/Users/Dan/project')

    expect(results).toHaveLength(1)
    expect(results[0].terminalId).toBe(term.terminalId)
  })

  it('should return results sorted by createdAt (oldest first)', () => {
    const registry = new TerminalRegistry()

    // Create terminals with slight delays to ensure different createdAt
    const term1 = registry.create({ mode: 'claude', cwd: '/home/user/project' })
    const term2 = registry.create({ mode: 'claude', cwd: '/home/user/project' })
    const term3 = registry.create({ mode: 'claude', cwd: '/home/user/project' })

    const results = registry.findUnassociatedClaudeTerminals('/home/user/project')

    expect(results).toHaveLength(3)
    // Oldest first (by createdAt)
    expect(results[0].terminalId).toBe(term1.terminalId)
    expect(results[1].terminalId).toBe(term2.terminalId)
    expect(results[2].terminalId).toBe(term3.terminalId)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/terminal-registry.test.ts -t "findUnassociatedClaudeTerminals"`
Expected: FAIL with "findUnassociatedClaudeTerminals is not a function"

**Step 3: Write minimal implementation**

Add to `server/terminal-registry.ts` after the `findClaudeTerminalsBySession` method:

```typescript
  /**
   * Find claude-mode terminals that have no resumeSessionId (waiting to be associated)
   * and whose cwd matches the given path. Results sorted by createdAt (oldest first).
   */
  findUnassociatedClaudeTerminals(cwd: string): TerminalRecord[] {
    const results: TerminalRecord[] = []
    // Platform-aware normalization: case-insensitive on Windows, case-sensitive on Unix
    const normalize = (p: string) => {
      const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '')
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized
    }
    const targetCwd = normalize(cwd)

    for (const term of this.terminals.values()) {
      if (term.mode !== 'claude') continue
      if (term.resumeSessionId) continue // Already associated
      if (!term.cwd) continue
      if (normalize(term.cwd) === targetCwd) {
        results.push(term)
      }
    }
    // Sort by createdAt ascending (oldest first)
    return results.sort((a, b) => a.createdAt - b.createdAt)
  }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/terminal-registry.test.ts -t "findUnassociatedClaudeTerminals"`
Expected: PASS

**Step 5: Commit**

```bash
git add server/terminal-registry.ts test/unit/server/terminal-registry.test.ts
git commit -m "feat(terminal-registry): add findUnassociatedClaudeTerminals method

Finds claude-mode terminals without resumeSessionId that match a given cwd.
Results sorted by createdAt (oldest first) for deterministic association.
Used for one-time session association when Claude creates a new session."
```

---

## Task 2: Add `setResumeSessionId` to TerminalRegistry

**Files:**
- Modify: `server/terminal-registry.ts` (after new method from Task 1)
- Test: `test/unit/server/terminal-registry.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/server/terminal-registry.test.ts`:

```typescript
describe('setResumeSessionId', () => {
  it('should set resumeSessionId on existing terminal', () => {
    const registry = new TerminalRegistry()
    const term = registry.create({ mode: 'claude', cwd: '/home/user/project' })

    const result = registry.setResumeSessionId(term.terminalId, 'new-session-id')

    expect(result).toBe(true)
    expect(registry.get(term.terminalId)?.resumeSessionId).toBe('new-session-id')
  })

  it('should return false for non-existent terminal', () => {
    const registry = new TerminalRegistry()

    const result = registry.setResumeSessionId('nonexistent', 'session-id')

    expect(result).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/terminal-registry.test.ts -t "setResumeSessionId"`
Expected: FAIL with "setResumeSessionId is not a function"

**Step 3: Write minimal implementation**

Add to `server/terminal-registry.ts` after `findUnassociatedClaudeTerminals`:

```typescript
  /**
   * Set the resumeSessionId on a terminal (one-time association).
   * Returns false if terminal not found.
   */
  setResumeSessionId(terminalId: string, sessionId: string): boolean {
    const term = this.terminals.get(terminalId)
    if (!term) return false
    term.resumeSessionId = sessionId
    return true
  }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/terminal-registry.test.ts -t "setResumeSessionId"`
Expected: PASS

**Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add server/terminal-registry.ts test/unit/server/terminal-registry.test.ts
git commit -m "feat(terminal-registry): add setResumeSessionId method

Allows one-time association of a terminal with a Claude session ID."
```

---

## Task 3: Add new session detection to ClaudeSessionIndexer

**Files:**
- Modify: `server/claude-indexer.ts` (class properties and `refresh()` method)
- Test: `test/unit/server/claude-indexer.test.ts`

**Key Design Decision:** The indexer must NOT fire `onNewSession` for sessions discovered on startup. Only sessions discovered AFTER the initial refresh (i.e., after handlers are attached) should trigger the callback. We use an `initialized` flag to track this.

**Step 1: Write the failing test**

Add to `test/unit/server/claude-indexer.test.ts`:

```typescript
import { ClaudeSessionIndexer, ClaudeSession } from '../../../server/claude-indexer'

describe('ClaudeSessionIndexer new session detection', () => {
  it('should call onNewSession handler only for newly discovered sessions after initialization', async () => {
    const indexer = new ClaudeSessionIndexer()
    const newSessionHandler = vi.fn()

    indexer.onNewSession(newSessionHandler)

    // Simulate indexer has been initialized (start() completed)
    indexer['initialized'] = true

    // Add session A to known set (simulating it was seen before)
    indexer['knownSessionIds'].add('session-a')

    // Simulate detecting sessions A and B
    const sessions: ClaudeSession[] = [
      { sessionId: 'session-a', projectPath: '/proj', updatedAt: Date.now(), cwd: '/proj' },
      { sessionId: 'session-b', projectPath: '/proj', updatedAt: Date.now(), cwd: '/proj' },
    ]

    indexer['detectNewSessions'](sessions)

    expect(newSessionHandler).toHaveBeenCalledTimes(1)
    expect(newSessionHandler).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-b' }))
  })

  it('should not call handlers before initialization (startup scenario)', () => {
    const indexer = new ClaudeSessionIndexer()
    const handler = vi.fn()

    indexer.onNewSession(handler)

    // initialized is false by default (before start() completes)
    // Simulate first refresh detecting existing sessions
    indexer['detectNewSessions']([
      { sessionId: 'existing-session', projectPath: '/proj', updatedAt: Date.now(), cwd: '/proj' },
    ])

    // Handler should NOT fire - we're still initializing
    expect(handler).not.toHaveBeenCalled()
    // But session should be tracked
    expect(indexer['knownSessionIds'].has('existing-session')).toBe(true)
  })

  it('should skip sessions without cwd', () => {
    const indexer = new ClaudeSessionIndexer()
    const handler = vi.fn()

    indexer.onNewSession(handler)
    indexer['initialized'] = true

    indexer['detectNewSessions']([
      { sessionId: 'no-cwd-session', projectPath: '/proj', updatedAt: Date.now(), cwd: undefined },
    ])

    expect(handler).not.toHaveBeenCalled()
  })

  it('should unsubscribe handler when returned function is called', () => {
    const indexer = new ClaudeSessionIndexer()
    const handler = vi.fn()

    const unsubscribe = indexer.onNewSession(handler)
    unsubscribe()
    indexer['initialized'] = true

    indexer['detectNewSessions']([
      { sessionId: 'new-session', projectPath: '/proj', updatedAt: Date.now(), cwd: '/proj' },
    ])

    expect(handler).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/server/claude-indexer.test.ts -t "new session detection"`
Expected: FAIL with "onNewSession is not a function" or "knownSessionIds" errors

**Step 3: Write minimal implementation**

Modify `server/claude-indexer.ts`:

Add to class properties (in the private properties section):
```typescript
  private knownSessionIds = new Set<string>()
  private onNewSessionHandlers = new Set<(session: ClaudeSession) => void>()
  private initialized = false
```

Add method after `onUpdate`:
```typescript
  onNewSession(handler: (session: ClaudeSession) => void): () => void {
    this.onNewSessionHandlers.add(handler)
    return () => this.onNewSessionHandlers.delete(handler)
  }

  private detectNewSessions(sessions: ClaudeSession[]) {
    for (const session of sessions) {
      // Skip sessions without cwd - can't associate them
      if (!session.cwd) continue

      if (!this.knownSessionIds.has(session.sessionId)) {
        this.knownSessionIds.add(session.sessionId)
        // Only fire handlers after initial scan is complete
        if (this.initialized) {
          for (const h of this.onNewSessionHandlers) {
            try {
              h(session)
            } catch (err) {
              logger.warn({ err }, 'onNewSession handler failed')
            }
          }
        }
      }
    }
  }
```

Modify `refresh()` method - add before `this.emitUpdate()`:
```typescript
    // Detect newly discovered sessions
    const allSessions = groups.flatMap(g => g.sessions)
    this.detectNewSessions(allSessions)
```

Modify `start()` method - set initialized flag after first refresh:
```typescript
  async start() {
    // ... existing code for reading config, setting up watcher ...

    await this.refresh()  // Populates knownSessionIds with existing sessions
    this.initialized = true  // Now enable onNewSession handlers

    // ... existing watcher setup ...
  }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/server/claude-indexer.test.ts -t "new session detection"`
Expected: PASS

**Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add server/claude-indexer.ts test/unit/server/claude-indexer.test.ts
git commit -m "feat(claude-indexer): add onNewSession callback for detecting new sessions

Tracks known session IDs and fires onNewSession only when a session is
first discovered AFTER initialization, not on server startup.
Used for one-time terminal association."
```

---

## Task 4: Wire up session association in server/index.ts

**Files:**
- Modify: `server/index.ts` (after `claudeIndexer.onUpdate` block)
- Test: `test/server/ws-protocol.test.ts` (integration test)

**Key Design Decision:** Associate only the OLDEST unassociated terminal when multiple match. This prevents incorrect associations when multiple Claude terminals are open in the same directory.

**Step 1: Add TypeScript type for the message**

Add to `server/ws-handler.ts` (or a shared types file) - a type for server-to-client broadcast messages:

```typescript
// Server-to-client broadcast message for session association
export interface SessionAssociatedMessage {
  type: 'terminal.session.associated'
  terminalId: string
  sessionId: string
}
```

**Step 2: Write the implementation**

Modify `server/index.ts` - add after the `claudeIndexer.onUpdate` block:

```typescript
  // One-time session association for new Claude sessions
  claudeIndexer.onNewSession((session) => {
    if (!session.cwd) return

    const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd)
    if (unassociated.length === 0) return

    // Only associate the oldest terminal (first in sorted list)
    // This prevents incorrect associations when multiple terminals share the same cwd
    const term = unassociated[0]
    logger.info({ terminalId: term.terminalId, sessionId: session.sessionId }, 'Associating terminal with new Claude session')
    registry.setResumeSessionId(term.terminalId, session.sessionId)
    try {
      wsHandler.broadcast({
        type: 'terminal.session.associated',
        terminalId: term.terminalId,
        sessionId: session.sessionId,
      })
    } catch (err) {
      logger.warn({ err, terminalId: term.terminalId }, 'Failed to broadcast session association')
    }
  })
```

**Step 3: Run tests to verify nothing broke**

Run: `npm test -- test/server/ws-protocol.test.ts`
Expected: PASS (no regressions)

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat(server): wire up session-terminal association on new session detection

When Claude creates a new session, find the oldest unassociated terminal
by cwd and associate it. Broadcasts terminal.session.associated to notify client.
Only associates ONE terminal to prevent incorrect matches with multiple tabs."
```

---

## Task 5: Handle `terminal.session.associated` in TerminalView

**Files:**
- Modify: `src/components/TerminalView.tsx` (in message handler, after `terminal.title.updated` handler)
- Test: Manual verification (message handler is inside useEffect)

**Note:** The message type `terminal.session.associated` is a new broadcast-only message (server-to-client), typed as `SessionAssociatedMessage` (added in Task 4). It's not part of `ClientMessageSchema`.

**Step 1: Write the implementation**

Modify `src/components/TerminalView.tsx` - add to the message handler (after the `terminal.title.updated` handler):

```typescript
        // Handle one-time session association (when Claude creates a new session)
        if (msg.type === 'terminal.session.associated' && msg.terminalId === tid) {
          updateContent({ resumeSessionId: msg.sessionId })
          // Also update the tab for sidebar session matching
          if (tabId) {
            dispatch(updateTab({ id: tabId, updates: { resumeSessionId: msg.sessionId } }))
          }
        }
```

**Important:** This updates BOTH the pane content (persisted to localStorage) AND the tab (for sidebar session matching). The `tabId` and `dispatch` should already be available in the component's scope.

**Step 2: Verify message types are consistent**

The server sends:
```typescript
{
  type: 'terminal.session.associated',
  terminalId: term.terminalId,
  sessionId: session.sessionId,
}
```

The client handles:
```typescript
if (msg.type === 'terminal.session.associated' && msg.terminalId === tid) {
  updateContent({ resumeSessionId: msg.sessionId })
  if (tabId) {
    dispatch(updateTab({ id: tabId, updates: { resumeSessionId: msg.sessionId } }))
  }
}
```

**Step 3: Run client tests**

Run: `npm test -- test/unit/client`
Expected: PASS (no regressions)

**Step 4: Commit**

```bash
git add src/components/TerminalView.tsx
git commit -m "feat(client): handle terminal.session.associated message

When server associates a terminal with a new Claude session, update both
pane content and tab with resumeSessionId. This is persisted to localStorage
and used to resume the session after server restart."
```

---

## Task 6: Verify `resumeSessionId` in paneTypes (no changes expected)

**Files:**
- Verify: `src/store/paneTypes.ts` already has `resumeSessionId`

**Step 1: Verify field exists**

Check `src/store/paneTypes.ts` for `resumeSessionId` in `TerminalPaneContent`.

Expected: The field already exists at line 20:
```typescript
/** Claude session to resume */
resumeSessionId?: string
```

**Step 2: Verify persistence works**

The `persistMiddleware` already saves full pane content to localStorage.
The `updateContent` callback does `{ ...current, ...updates }` which preserves existing fields.

**No changes needed** - this is a verification step only.

---

## Task 7: End-to-end manual test

**Steps:**

1. Start the dev server: `npm run dev`
2. Open browser, create a new Claude tab (not from history)
3. Claude starts - verify it works normally
4. Wait a few seconds for Claude to create its session file
5. Check browser console for `terminal.session.associated` message
6. Restart the server (Ctrl+C, `npm run dev`)
7. Verify the terminal reconnects and Claude resumes the same session (shows previous conversation)

**Expected behavior:**
- Step 5: Console shows the association message
- Step 7: Claude resumes instead of starting fresh

---

## Task 8: Write integration test for full flow

**Files:**
- Create: `test/server/session-association.test.ts`

**Step 1: Write the integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { TerminalRegistry } from '../../server/terminal-registry'
import { ClaudeSessionIndexer, ClaudeSession } from '../../server/claude-indexer'

describe('Session-Terminal Association Integration', () => {
  it('should associate terminal with session when session is created', () => {
    const registry = new TerminalRegistry()
    const indexer = new ClaudeSessionIndexer()
    const broadcasts: any[] = []

    // Simulate wsHandler.broadcast
    const mockBroadcast = (msg: any) => broadcasts.push(msg)

    // Wire up like in index.ts
    indexer.onNewSession((session) => {
      if (!session.cwd) return
      const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd)
      if (unassociated.length === 0) return
      const term = unassociated[0] // Only oldest
      registry.setResumeSessionId(term.terminalId, session.sessionId)
      mockBroadcast({
        type: 'terminal.session.associated',
        terminalId: term.terminalId,
        sessionId: session.sessionId,
      })
    })

    // Simulate indexer is initialized
    indexer['initialized'] = true

    // Create an unassociated claude terminal
    const term = registry.create({ mode: 'claude', cwd: '/home/user/project' })
    expect(term.resumeSessionId).toBeUndefined()

    // Simulate new session detection
    const newSession: ClaudeSession = {
      sessionId: 'claude-session-123',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: '/home/user/project',
    }
    indexer['detectNewSessions']([newSession])

    // Verify association
    expect(registry.get(term.terminalId)?.resumeSessionId).toBe('claude-session-123')
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0]).toEqual({
      type: 'terminal.session.associated',
      terminalId: term.terminalId,
      sessionId: 'claude-session-123',
    })
  })

  it('should not associate already-associated terminals', () => {
    const registry = new TerminalRegistry()
    const indexer = new ClaudeSessionIndexer()
    const broadcasts: any[] = []

    indexer.onNewSession((session) => {
      if (!session.cwd) return
      const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd)
      if (unassociated.length === 0) return
      const term = unassociated[0]
      registry.setResumeSessionId(term.terminalId, session.sessionId)
      broadcasts.push({ type: 'terminal.session.associated', terminalId: term.terminalId })
    })

    indexer['initialized'] = true

    // Create terminal that already has resumeSessionId
    registry.create({ mode: 'claude', cwd: '/home/user/project', resumeSessionId: 'existing-session' })

    // Simulate new session
    indexer['detectNewSessions']([{
      sessionId: 'new-session',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: '/home/user/project',
    }])

    // Should not broadcast - terminal already associated
    expect(broadcasts).toHaveLength(0)
  })

  it('should only associate the oldest terminal when multiple match same cwd', () => {
    const registry = new TerminalRegistry()
    const indexer = new ClaudeSessionIndexer()
    const broadcasts: any[] = []

    indexer.onNewSession((session) => {
      if (!session.cwd) return
      const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd)
      if (unassociated.length === 0) return
      const term = unassociated[0] // Only oldest
      registry.setResumeSessionId(term.terminalId, session.sessionId)
      broadcasts.push({
        type: 'terminal.session.associated',
        terminalId: term.terminalId,
        sessionId: session.sessionId,
      })
    })

    indexer['initialized'] = true

    // Create TWO unassociated terminals with same cwd
    const term1 = registry.create({ mode: 'claude', cwd: '/home/user/project' })
    const term2 = registry.create({ mode: 'claude', cwd: '/home/user/project' })

    // Simulate new session
    indexer['detectNewSessions']([{
      sessionId: 'new-session',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: '/home/user/project',
    }])

    // Should only associate the OLDEST terminal (term1)
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].terminalId).toBe(term1.terminalId)
    expect(registry.get(term1.terminalId)?.resumeSessionId).toBe('new-session')
    expect(registry.get(term2.terminalId)?.resumeSessionId).toBeUndefined()
  })

  it('should correctly associate two terminals when two sessions are created in sequence', () => {
    const registry = new TerminalRegistry()
    const indexer = new ClaudeSessionIndexer()
    const broadcasts: any[] = []

    indexer.onNewSession((session) => {
      if (!session.cwd) return
      const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd)
      if (unassociated.length === 0) return
      const term = unassociated[0] // Only oldest unassociated
      registry.setResumeSessionId(term.terminalId, session.sessionId)
      broadcasts.push({
        type: 'terminal.session.associated',
        terminalId: term.terminalId,
        sessionId: session.sessionId,
      })
    })

    indexer['initialized'] = true

    // Create TWO unassociated terminals with same cwd (e.g., split pane scenario)
    const term1 = registry.create({ mode: 'claude', cwd: '/home/user/project' })
    const term2 = registry.create({ mode: 'claude', cwd: '/home/user/project' })

    // First Claude (term1) creates its session
    indexer['detectNewSessions']([{
      sessionId: 'session-for-term1',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: '/home/user/project',
    }])

    // term1 should now be associated
    expect(registry.get(term1.terminalId)?.resumeSessionId).toBe('session-for-term1')
    expect(registry.get(term2.terminalId)?.resumeSessionId).toBeUndefined()

    // Second Claude (term2) creates its session
    indexer['detectNewSessions']([{
      sessionId: 'session-for-term2',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: '/home/user/project',
    }])

    // Now term2 should also be associated (with different session)
    expect(registry.get(term1.terminalId)?.resumeSessionId).toBe('session-for-term1')
    expect(registry.get(term2.terminalId)?.resumeSessionId).toBe('session-for-term2')

    // Two broadcasts total, one per terminal
    expect(broadcasts).toHaveLength(2)
    expect(broadcasts[0].terminalId).toBe(term1.terminalId)
    expect(broadcasts[0].sessionId).toBe('session-for-term1')
    expect(broadcasts[1].terminalId).toBe(term2.terminalId)
    expect(broadcasts[1].sessionId).toBe('session-for-term2')
  })

  it('should not fire handlers on server startup (before initialized)', () => {
    const registry = new TerminalRegistry()
    const indexer = new ClaudeSessionIndexer()
    const broadcasts: any[] = []

    indexer.onNewSession((session) => {
      if (!session.cwd) return
      const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd)
      if (unassociated.length === 0) return
      const term = unassociated[0]
      registry.setResumeSessionId(term.terminalId, session.sessionId)
      broadcasts.push({ type: 'terminal.session.associated', terminalId: term.terminalId })
    })

    // Create terminal
    registry.create({ mode: 'claude', cwd: '/home/user/project' })

    // Simulate startup: detectNewSessions called BEFORE initialized = true
    // This simulates what happens during start() before initialized flag is set
    indexer['detectNewSessions']([{
      sessionId: 'existing-session',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: '/home/user/project',
    }])

    // Should NOT broadcast - indexer not yet initialized
    expect(broadcasts).toHaveLength(0)
    // But session should be tracked
    expect(indexer['knownSessionIds'].has('existing-session')).toBe(true)
  })

  it('should skip sessions without cwd', () => {
    const registry = new TerminalRegistry()
    const indexer = new ClaudeSessionIndexer()
    const broadcasts: any[] = []

    indexer.onNewSession((session) => {
      if (!session.cwd) return
      const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd!)
      if (unassociated.length === 0) return
      const term = unassociated[0]
      registry.setResumeSessionId(term.terminalId, session.sessionId)
      broadcasts.push({ type: 'terminal.session.associated', terminalId: term.terminalId })
    })

    indexer['initialized'] = true

    // Create terminal
    registry.create({ mode: 'claude', cwd: '/home/user/project' })

    // Simulate session with NO cwd (orphaned session)
    indexer['detectNewSessions']([{
      sessionId: 'orphaned-session',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: undefined,
    }])

    // Should NOT broadcast - session has no cwd
    expect(broadcasts).toHaveLength(0)
  })

  it('should not associate shell-mode terminals', () => {
    const registry = new TerminalRegistry()
    const indexer = new ClaudeSessionIndexer()
    const broadcasts: any[] = []

    indexer.onNewSession((session) => {
      if (!session.cwd) return
      const unassociated = registry.findUnassociatedClaudeTerminals(session.cwd)
      if (unassociated.length === 0) return
      const term = unassociated[0]
      registry.setResumeSessionId(term.terminalId, session.sessionId)
      broadcasts.push({ type: 'terminal.session.associated', terminalId: term.terminalId })
    })

    indexer['initialized'] = true

    // Create a SHELL terminal (not claude mode)
    registry.create({ mode: 'shell', cwd: '/home/user/project' })

    // Simulate new session
    indexer['detectNewSessions']([{
      sessionId: 'new-session',
      projectPath: '/home/user/project',
      updatedAt: Date.now(),
      cwd: '/home/user/project',
    }])

    // Should NOT broadcast - no claude-mode terminals
    expect(broadcasts).toHaveLength(0)
  })
})
```

**Step 2: Run the test**

Run: `npm test -- test/server/session-association.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add test/server/session-association.test.ts
git commit -m "test: add integration tests for session-terminal association

Covers: basic association, already-associated terminals, multiple terminals
with same cwd (oldest wins), two terminals with sequential sessions (split pane),
server startup scenario, sessions without cwd, and shell-mode terminals."
```

---

## Summary

After completing all tasks:

1. **TerminalRegistry** has `findUnassociatedClaudeTerminals(cwd)` (sorted by createdAt, oldest first) and `setResumeSessionId(id, sessionId)`
2. **ClaudeSessionIndexer** tracks known sessions and fires `onNewSession` only for sessions discovered AFTER initialization
3. **server/index.ts** wires up the association logic (associates only the oldest matching terminal)
4. **TerminalView** handles the `terminal.session.associated` message and persists `resumeSessionId` to both pane content AND tab
5. On server restart, client sends `resumeSessionId` when recreating terminal, Claude resumes

The approach is:
- **One-time**: Association happens once at session creation
- **Explicit**: Stored in both server (TerminalRecord) and client (pane content/localStorage)
- **Clean**: Separate from auto-title logic
- **Robust**: Survives server restarts via client-side persistence
- **Deterministic**: When multiple terminals match, only the oldest is associated
- **Safe on restart**: Existing sessions at startup don't trigger false associations
- **Platform-aware**: CWD matching is case-insensitive on Windows, case-sensitive on Unix
- **Type-safe**: `SessionAssociatedMessage` type defined for the new broadcast message
- **Error-handled**: Broadcast failures are caught and logged without crashing
