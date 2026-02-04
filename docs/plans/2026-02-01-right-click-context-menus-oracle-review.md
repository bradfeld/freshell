# Oracle Review: Right Click Context Menus Plan

**Reviewed by:** GPT-5.2 Pro
**Date:** 2026-02-01
**Duration:** 13m00s

---

The plan is directionally solid (small portal-based menu + a single root "context capture" + mapping targets → menu defs that dispatch Redux actions). The incremental commits and the intent to propagate `archived`/`createdAt` end-to-end are also good.

That said, there are several architectural hazards, some TDD/test issues (a couple are outright wrong or too weak), and some missing product/UX and accessibility considerations that will bite you later—especially in a terminal multiplexer UI with portals, iframes, and lots of interactive regions.

Below is a thorough critique, organized by architecture, TDD, task breakdown, and missing considerations/improvements.

---

## Architecture review

### 1) Root capture + `data-context` is pragmatic, but has sharp edges

**Pros**

* Very low ceremony: no per-component providers/hooks, just attributes.
* Easy to add support for new surfaces without wiring new callbacks through props.
* Works well with React where DOM structure is stable.

**Cons / risks**

* **Stringly-typed interface**: `data-context="pane-divider"` etc. is easy to typo and hard to refactor. You'll eventually have drift between:

  * the context names in DOM,
  * the switch cases in `menu-defs.ts`,
  * the tests.
    **Improvement:** centralize context names in a typed constant map:

  ```ts
  export const ContextIds = {
    Global: 'global',
    Tab: 'tab',
    Pane: 'pane',
    SidebarSession: 'sidebar-session',
    // ...
  } as const
  export type ContextId = typeof ContextIds[keyof typeof ContextIds]
  ```

  Then use `data-context={ContextIds.Tab}` everywhere.

* **Dataset typing and parsing**: `HTMLElement.dataset` values are all strings (or undefined). You'll want a typed `ContextTarget` that parses and validates required ids:

  * `tabId`, `paneId`, `sessionId` should be present for certain contexts.
  * If missing, menu items should be absent/disabled, not crash.
    **Improvement:** define `parseContextTarget(found)` that returns a discriminated union:

  ```ts
  type ContextTarget =
    | { kind: 'global' }
    | { kind: 'tab'; tabId: string }
    | { kind: 'pane'; tabId: string; paneId: string }
    | { kind: 'sidebar-session'; sessionId: string }
  ```

  Don't pass raw `dataset` around.

* **Portals break wrapper-level bubbling**: if you attach `onContextMenuCapture` to a wrapper `<div>`, you *will miss events* from any UI rendered via `createPortal` outside that wrapper (modals, popovers, toasts, etc.). In a multiplexer UI, you almost certainly have portals already.
  **Improvement:** attach listeners on `document` in the provider with capture phase:

  ```ts
  useEffect(() => {
    const handler = (e: MouseEvent) => { /* ... */ }
    document.addEventListener('contextmenu', handler, true) // capture
    return () => document.removeEventListener('contextmenu', handler, true)
  }, [])
  ```

* **Iframe limitation is real**: right-click inside an iframe won't reach the parent document. The plan notes "Browser iframe -> native only"; that's correct. Just make sure your root handler doesn't show a global menu when you right-click "over" an iframe element itself (you can only catch events on the iframe element, not inside).

### 2) Portal-based menu is correct, but your primitive is missing essential behavior

Your `ContextMenu` primitive is currently just a positioned `<div>` with buttons and an Escape handler. It's missing:

* **Close on click outside** (and/or close on any pointerdown outside). Without this, the menu can "stick" in weird ways.
* **Close on scroll / resize** (otherwise the menu floats detached from the UI).
* **Prevent focus loss issues**: right click doesn't always focus the menu; keyboard interactions will be inconsistent.
* **ARIA roles & keyboard navigation**: a context menu should be usable via keyboard and screen readers:

  * `role="menu"` on container
  * `role="menuitem"` on items
  * arrow key navigation
  * Escape closes
  * focus is moved into the menu when it opens, restored when it closes

If you intend to keep it lightweight, you can still do a minimum-accessible version. But right now it's not.

**Positioning**: clamping after first paint will cause a visible jump near edges. Use `useLayoutEffect` and/or render offscreen to measure before showing. Or use a positioning helper library (`@floating-ui/react`) which solves this class of issues cleanly.

### 3) You're building a second portal overlay component (ConfirmModal)

You now have:

* `ConfirmModal` (portal + backdrop)
* `ContextMenu` (portal, no backdrop)

This duplication will lead to inconsistent z-index stacking, focus behavior, and escape handling. Also, both use `z-50` which is a **stacking bug** waiting to happen: whichever renders later wins; you'll have a context menu appearing on top of a confirm modal or vice versa.

**Improvement:** define a single overlay layer system:

* modal layer z-60
* context menu layer z-50
* tooltip layer z-40
  …or use CSS variables / a single `PortalHost`.

---

## Server/session model changes

### 1) `createdAt` derivation from file stats is not stable across platforms

You propose:

```ts
createdAt: stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs || ...
```

Concerns:

* On Linux, `birthtime` can be 0/unsupported; on some FS it's synthetic.
* `ctime` is "inode change time," not creation time.
* `mtime` changes whenever file content changes, so "createdAt" will drift for sessions that get rewritten/migrated.

If "createdAt" matters to users (it will, once shown), you should consider **persisting a true createdAt** the first time you see a session:

* either inside the session file metadata (best),
* or in `ConfigStore` overrides (`sessionOverrides[sessionId].createdAtOverride`) on first encounter.

At minimum: document that it's "first seen / file birthtime-ish," not true creation time.

### 2) `applyOverride` and test strategy is awkward

You have this in the test:

```ts
const merged = (globalThis as any).applyOverrideForTest(session, ov)
```

And then "export helper for tests only".

That's a smell. Tests should either:

* call a public function, or
* import an exported helper normally (and accept it's part of module API), or
* validate behavior through `claudeIndexer.refresh()` results.

Using `globalThis` and test-only exports makes the module shape weird and encourages leaking internals.

**Improvement:** export `applyOverride` (named export) and test it directly, or write a test that runs a small end-to-end refresh with a temp FS fixture.

### 3) Your search sorting test is likely incorrect / too weak

This test:

```ts
const results = searchTitleTier(projects, 'a')
expect(results[results.length - 1].sessionId).toBe('a')
```

But session `b` has title `'B'`, so query `'a'` probably doesn't match it. If only session `a` matches, the test passes regardless of sorting behavior and **doesn't validate the intended constraint**.

**Fix the test** so both match. Examples:

* set titles `'Alpha'` and `'Albatross'`
* search for `'a'`
* assert non-archived first

Also ensure you test ties and secondary ordering (updatedAt descending) within archived/non-archived groups.

### 4) API patch endpoint needs validation

You propose:

```ts
const { titleOverride, summaryOverride, deleted, archived } = req.body || {}
```

If `archived` arrives as `"true"` (string) from some client, you'll persist garbage and have inconsistent behavior across code paths.

**Improvement:** use a Zod schema at the endpoint boundary:

* coerce booleans if you want to be forgiving,
* or reject invalid values with 400.

Also consider: do you want to allow clearing overrides? If yes, you'll need explicit `null` handling.

---

## Client types, sorting, sidebar UI

### 1) Sorting archived "last" needs a clearer spec

Your selector implementation splits all items:

```ts
const active = items.filter(i => !i.archived)
const archived = items.filter(i => i.archived)
return [...sortedActive, ...sortedArchived]
```

Potential mismatch with user expectation:

* If sidebar is grouped by project, do you want archived sessions at bottom **within each project**, or **globally** across projects?
* If you sort by recency, do you want "archived at end" to override *everything*, or only within project groups?

Right now, it sounds like "archived last" globally, which can produce confusing jumps (Project A archived session appears after all of Project B).

**Improvement:** apply the archived split at the correct grouping layer:

* within each project group list,
* or within the flattened list but preserve project sections.

### 2) UI affordances for archived state are missing

An icon is nice, but you need to think through:

* How do users *unarchive* quickly?
* Should archived sessions be collapsed by default?
* Should they be searchable? (You're sorting them last, but not filtering them out; that's fine, but confirm spec.)

Also, if there's a session already open in a tab:

* Should "archive" close it? probably not.
* Should "delete" be blocked if running? likely.

These state rules should be encoded as disabled menu items, confirm modals, or warnings.

---

## Confirm modal critique

Your modal implementation is not "minimal focus trap"; it's **no focus trap**. Missing:

* `role="dialog"` and `aria-modal="true"`
* focus moved to modal on open (e.g., confirm button)
* Escape closes
* tab focus trapped inside
* restore focus on close
* prevent background scroll

Also: `onClick={onCancel}` on the backdrop will cancel on any click; good. But you'll want to ensure clicking inside doesn't bubble. You did stopPropagation.

**Big layering issue:** `z-50` conflicts with context menu's `z-50`.

If the app already has a modal or dialog primitive, reuse it. If not, consider using a well-tested library (Radix Dialog) and styling with Tailwind.

---

## Context menu provider & event handling issues

### 1) Task ordering problem: Provider test expects menu defs that aren't implemented yet

Task 5 test:

```tsx
expect(screen.getByText('New tab')).toBeInTheDocument()
```

But `New tab` comes from `menu-defs.ts` in Task 7.

So either:

* Task 5 must include a minimal menu definition for `'global'`, or
* the Task 5 test should only assert that the menu opens (e.g., presence of menu container), not specific items, or
* reorder tasks: define `menu-defs.ts` before provider tests.

Right now, the plan as written will fail in real execution order.

### 2) `shouldUseNativeMenu` needs a real policy

This is critical. If you prevent default everywhere and show "global menu," you break expected behaviors:

* inputs/textarea: paste, spellcheck, etc.
* contenteditable: editing tools
* links: "Open in new tab"
* terminal text selection: copy
* devtools workflow: right click inspect (in dev)

You probably want:

* native menu allowed for inputs, textareas, contenteditable, and (maybe) inside an iframe element
* possibly allow native menu if user holds a modifier (e.g., Shift+RightClick shows native)
* if there's a text selection, perhaps include Copy in your menu or allow native

### 3) Store a plain object snapshot, not `dataset`

`dataset` is a live `DOMStringMap`. Storing it in React state is not ideal.

Use:

```ts
const data = { ...node.dataset }
```

and parse/validate.

### 4) Close behavior must be global

You need to close on:

* pointerdown outside
* any left click
* contextmenu invoked again (reopen at new target)
* window blur
* scroll/resize
* route/view changes (optional)

Right now, only Escape is handled at the menu component level, and the provider doesn't show close logic.

---

## Menu definitions & action dispatch

### 1) Menu item model needs "disabled", "danger", "separator", "shortcut"

Your menu items are just `{id, label, onSelect}`. That's insufficient for a complex multiplexer UI.

Add fields:

* `disabled?: boolean`
* `danger?: boolean`
* `shortcut?: string` (for discoverability)
* `separator?: true` or explicit separator item type
* `icon?: ReactNode` if you want

Then render properly.

### 2) Destructive actions should confirm (and some should be blocked)

Examples that probably need confirmation or safeguards:

* "Close all but this tab"
* "Delete session"
* "Archive session" maybe not confirm, but at least show toast/undo?

Also block impossible actions:

* Move tab left when already first.
* Close other tabs if only one.
* Delete session if it's running (or confirm "this will stop…").

### 3) Async actions and error handling

Actions like:

* patch session archive/delete
* copy to clipboard
  can fail.

If `navigator.clipboard.writeText` rejects, you should:

* fallback to legacy copy method
* or show a toast

Your tests assume clipboard always exists.

---

## TDD approach: good intent, but some tests are brittle or incomplete

### What's good

* Each task begins with a failing test, then minimal implementation.
* Commit granularity is excellent.
* Server and client changes are separately tested.

### Issues / improvements

* **Prefer `userEvent` over `fireEvent`** for realistic pointer/keyboard interactions, especially for long-press and contextmenu events. `fireEvent` can miss behavior like focus changes.
* **Clipboard mocking**: in Vitest + jsdom, `navigator.clipboard` often doesn't exist. You need a test setup file that defines it.
* **Long-press tests**: require fake timers; ensure you reset timers between tests.
* **Provider/menu integration tests**: you should have at least one test that:

  * right-clicks a tab item,
  * asserts the tab-specific menu appears,
  * selects an item,
  * asserts the correct Redux action dispatched (or state change).
* **Server tests**: add a test ensuring `archived` override is preserved when patching *other* fields (e.g., patch title shouldn't clear archived). Otherwise you can easily regress.

---

## Task breakdown review

### What works well

* Sequencing starts with backend metadata, then client types, then UI wiring—good.
* The plan is decomposed into small commits.

### What needs adjustment

1. **Task 5 depends on Task 7** as noted. Reorder or weaken the test.
2. **Task 10 references "lists 1/4/5/8/11/16/17-20" that are not in this plan.**

   * This is a major incompleteness: you can't implement "wire menu actions across UI" without a fully specified menu inventory.
   * If those lists exist elsewhere, they need to be included or linked explicitly, otherwise this plan isn't self-contained.
3. **Two overlay primitives** (ConfirmModal, ContextMenu) will create duplicated work and inconsistent behavior. Consolidate early.

---

## Missing considerations (important)

### Accessibility & keyboard parity

* Context menus should also be openable via keyboard (e.g., Shift+F10 or Menu key) for focused elements.
* Focus management and ARIA roles matter if you care about accessibility.

### Selection-aware behavior (especially for a terminal)

Users right-click to operate on selection:

* Copy selected text
* Paste (especially into terminal)
* Search selection
  Your plan's global menu includes "Copy all tab names," but nothing about selection, paste, etc.

### Performance and refresh strategy

`PATCH /api/sessions/:id` triggers:

* config store patch
* `claudeIndexer.refresh()` full refresh
* websocket broadcast full project list

For large session sets, this could be expensive for a single toggle. If refresh is heavy, consider:

* updating in-memory override map + remerging without full refresh, or
* making refresh incremental.

Even if you keep full refresh, consider debouncing bursts of changes.

### Data evolution and migration

Adding fields to schemas:

* ensure client tolerates missing `createdAt`/`archived` from older servers or cached payloads
* ensure server tolerates old config overrides that don't include archived

You're mostly doing optional fields, which helps.

### Security/privacy

Copying "full metadata JSON" includes `projectPath`, `cwd`, and potentially summaries. That's fine as an explicit user action, but consider:

* do you want to redact tokens/secrets if they appear in summary/cwd?
* might not be necessary, but worth noting.

---

## Concrete improvements I'd make to the plan

1. **Make context target parsing typed**

   * Replace "return dataset" with a parser that returns a discriminated union.
   * Add tests for missing IDs (menu should not crash).

2. **Attach provider event listeners to `document`**

   * Especially to catch events from portals.

3. **Add close-on-outside-click + close-on-scroll/resize**

   * Implement once in provider or menu.
   * Add a test for outside click closes.

4. **Fix the server search sorting test**

   * Ensure both sessions match query and verify ordering.
   * Add tie-breaker tests.

5. **Unify overlay stacking**

   * Decide z-index policy.
   * Prefer a single overlay host.

6. **Make menu item model richer**

   * Add disabled/separator/danger/shortcut.
   * Add corresponding rendering and tests.

7. **Define the actual menu inventories**

   * Task 10 is not actionable without the missing lists.

8. **Add a minimal accessibility pass**

   * `role="menu"`, `role="menuitem"`
   * focus on open, restore on close
   * Escape closes
   * Arrow key navigation (at least up/down)
   * keyboard-open support (Shift+F10) for focused targets

9. **Native menu policy**

   * Write explicit `shouldUseNativeMenu` rules and tests.

---

## Bottom line

* The plan's *direction* is good: a centralized context menu system with incremental tasks and TDD.
* The *current plan text* has several correctness issues (notably the Task 5/7 dependency and at least one flawed server test), and it's missing crucial UX/accessibility/close behavior requirements that will make the menu feel broken or inconsistent.
* The biggest "architectural" fix is to avoid wrapper-level event capture (portals) and to stop passing raw `dataset` around—parse it into typed targets.

If you want, I can propose a revised task ordering + a tightened test matrix (what to test at each layer: server model, provider behavior, menu rendering, action dispatch, and the high-risk UI surfaces like terminal selection and iframes).
