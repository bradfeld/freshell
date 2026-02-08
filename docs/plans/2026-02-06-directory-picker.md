# Directory Picker for Coding CLI Launch

## Context

When launching a coding CLI (Claude, Codex, etc.) from the pane picker, it either uses a saved per-provider `cwd` from settings or the system default. There's no quick way to choose a directory at launch time. We want a fast, search-as-you-type directory picker that appears between "pick a CLI" and "spawn the terminal."

## UX Design

After selecting a coding CLI from the pane picker, a **directory picker** replaces the pane picker in the same pane space:

- **Input field** pre-populated with the last directory used for that provider (text fully selected, so typing replaces it)
- **Dual-mode input:**
  - **Fuzzy search** (default): typing "bar" matches `~/code/foo-bar`, `~/projects/sidebar`, etc. against a curated candidate list
  - **Path completion**: when input starts with `/`, `~`, or a drive letter, switches to server-side readdir-based autocomplete (directory-only)
- **Suggestion list** below the input showing fuzzy matches or completions (clickable)
- **Keyboard**: Up/Down to navigate suggestions, Tab to autocomplete, Enter to confirm, Escape to go back to pane picker

## Candidate Sources (no background process)

| Source | How | Cost |
|--------|-----|------|
| Coding CLI session paths | `codingCliIndexer.getProjects()` — projectPath + session.cwd | Free (already indexed) |
| Active terminal cwds | `registry.list()` | Free (in memory) |
| Recently used directories | New `recentDirectories[]` in config | Free (persisted array) |
| Per-provider saved cwd | `settings.codingCli.providers[name].cwd` | Free (in config) |
| Default cwd | `settings.defaultCwd` | Free (in config) |

## Implementation Plan

### Step 1: Add `recentDirectories` to server config

**Files:**
- `server/config-store.ts` — Add `recentDirectories?: string[]` to `UserConfig` type. Add `pushRecentDirectory(dir)` method: deduplicates, prepends, caps at 20 entries, mutex-protected atomic write.

**Tests (write first):**
- `test/unit/server/config-store.test.ts` — pushRecentDirectory: dedup, ordering, cap at 20

### Step 2: Add `dirs` filter to existing file completion endpoint

**Files:**
- `server/files-router.ts` — Modify `GET /api/files/complete` to accept optional `?dirs=true` query param. When set, filter entries to `entry.isDirectory()` only.

**Tests (write first):**
- `test/integration/server/files-api.test.ts` — Test `?dirs=true` returns only directories

### Step 3: Add candidate directories endpoint

**Files:**
- `server/index.ts` — Add `GET /api/files/candidate-dirs` endpoint. Aggregates directories from: coding CLI session paths/cwds, active terminal cwds, recently used dirs, per-provider saved cwds, default cwd. Returns deduplicated `{ directories: string[] }`.

**Tests (write first):**
- `test/integration/server/candidate-dirs-api.test.ts` — Test aggregation from multiple sources

### Step 4: Create fuzzy match utility

**Files:**
- `src/lib/fuzzy-match.ts` (new) — `fuzzyMatch(query, candidate): { score, indices } | null`. Case-insensitive, scores consecutive matches and word-boundary matches higher, penalizes long candidates. No external dependency needed — candidate list is at most a few hundred items.

**Tests (write first):**
- `test/unit/client/lib/fuzzy-match.test.ts` — Covers: match ordering, null for non-match, consecutive bonus, boundary bonus, case insensitivity

### Step 5: Create DirectoryPicker component

**Files:**
- `src/components/panes/DirectoryPicker.tsx` (new)

**Props:** `providerType`, `providerLabel`, `defaultCwd`, `onConfirm(cwd)`, `onBack()`

**Behavior:**
- On mount: fetch `GET /api/files/candidate-dirs`, store as candidate list. Auto-select input text.
- **Fuzzy mode** (input doesn't look like a path): filter candidates with `fuzzyMatch()`, sort by score, show top 15
- **Path mode** (input starts with `/`, `~`, drive letter): debounce 200ms, call `GET /api/files/complete?prefix=...&dirs=true`, show results
- On Enter: validate with `POST /api/files/validate-dir`. If valid → `onConfirm(resolvedPath)`. If invalid → show inline error.
- Race condition safety: use validation-ID counter pattern (same as SettingsView.tsx)

**Accessibility:**
- `role="combobox"` on input, `aria-expanded`, `aria-activedescendant`, `aria-controls`
- `role="listbox"` on suggestion list, `role="option"` on each suggestion
- Label: "Starting directory for {providerLabel}"

**Tests (write first):**
- `test/unit/client/components/panes/DirectoryPicker.test.tsx` — Renders with defaultCwd, text selected on mount, fuzzy search mode, path completion mode, arrow nav, Enter/Escape/Tab behavior, validation error display, accessibility attributes

### Step 6: Integrate into PickerWrapper

**Files:**
- `src/components/panes/PaneContainer.tsx` — Add local state machine to PickerWrapper:
  - `{ step: 'type' }` → shows PanePicker (current behavior)
  - `{ step: 'directory', providerType }` → shows DirectoryPicker
  - Coding CLI selection → transitions to directory step (instead of immediately spawning terminal)
  - Non-CLI types (shell, browser, editor) → unchanged (immediate dispatch)
  - `handleDirectoryConfirm(cwd)` → creates terminal content with `initialCwd: cwd`, dispatches `updatePaneContent`
  - Also persists the chosen cwd to settings (same pattern as SettingsView: `api.patch('/api/settings', { codingCli: { providers: { [type]: { cwd } } } })`)

**Tests (extend existing):**
- `test/unit/client/components/panes/PaneContainer.test.tsx` — Coding CLI selection shows directory picker, non-CLI selection skips it, onConfirm dispatches correct content, onBack returns to type picker

### Step 7: Record directory usage on terminal create

**Files:**
- `server/ws-handler.ts` — In the `terminal.create` handler, after successful coding CLI terminal creation with an explicit `cwd`, call `configStore.pushRecentDirectory(cwd)`

**Tests:**
- `test/integration/server/ws-handler.test.ts` or `test/unit/server/ws-handler.test.ts` — Verify recent directory is recorded on coding CLI terminal create

### Step 8: E2E test

- Extend existing e2e tests or new file: full flow from pane picker → CLI selection → directory picker → type/search → confirm → terminal spawns with correct cwd

## Key Files Reference

| File | Role |
|------|------|
| `src/components/panes/PaneContainer.tsx` | Integration point (PickerWrapper state machine) |
| `src/components/panes/DirectoryPicker.tsx` | New component |
| `src/lib/fuzzy-match.ts` | New utility |
| `server/files-router.ts` | Add `dirs` filter to existing completion |
| `server/index.ts` | Add candidate-dirs endpoint |
| `server/config-store.ts` | Add recentDirectories + pushRecentDirectory |
| `server/ws-handler.ts` | Record directory usage |

## Verification

1. `npm test` — all existing + new tests pass
2. `npm run lint` — no a11y violations
3. Manual: open pane picker → select Claude → directory picker appears with input pre-filled → type partial name → fuzzy results appear → press Enter → terminal spawns in selected directory → reopen picker → recently used directory appears in suggestions
