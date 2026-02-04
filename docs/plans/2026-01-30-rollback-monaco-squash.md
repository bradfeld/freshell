# Rollback Monaco Squash and Proper Merge

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Roll back the broken monaco squash (de47990), restore main to the good state (f25a6a2), and properly merge the monaco feature.

**Architecture:** The squash commit de47990 was created from a stale worktree based on 26ded94, which wiped out 44 commits of work that happened on main. We will reset to the good state, cherry-pick the one new commit, then do a proper merge of the monaco branch tip.

**Tech Stack:** Git operations (reset, cherry-pick, merge)

---

## Background

### The Problem

Commit de47990 ("feat: monaco editor pane") was a squash merge from a stale worktree. The worktree was based on commit 26ded94, but main had advanced significantly with 44 commits including:

- Pane titles system (paneTitles state, updatePaneTitle, derivePaneTitle)
- Activity sorting (lastInputAt, sessionActivitySlice)
- Session auto-association (findUnassociatedClaudeTerminals, setResumeSessionId)
- Portal-based tooltips
- Settings terminal preview
- And more

The squash effectively reverted all these changes while adding the monaco feature.

### Key Commits

| Commit | Description |
|--------|-------------|
| `f25a6a2` | Last good state of main (before broken squash) |
| `26ded94` | Where monaco branch diverged from main |
| `4503289` | Tip of monaco feature branch (20 commits) |
| `8491838` | Settings migration (new work after the squash) |
| `de47990` | The broken squash commit |
| `8c07608` | Current HEAD with partial restorations |

### Files With Potential Conflicts

These 8 files were modified in both main and monaco:
- `package.json` / `package-lock.json`
- `server/index.ts`
- `src/components/panes/PaneContainer.tsx`
- `src/store/paneTypes.ts`
- 3 test files

The merge will handle these via 3-way merge, which is smarter than sequential cherry-picks.

---

## Task 1: Create Safety Branch

**Files:** None (git operations only)

**Step 1: Verify clean working directory**

```bash
git status
```

Expected: No staged changes (untracked files are OK)

**Step 2: Create backup branch at current HEAD**

```bash
git branch backup/pre-rollback-2026-01-30
```

**Step 3: Verify backup exists**

```bash
git branch | grep backup
```

Expected output includes: `backup/pre-rollback-2026-01-30`

**Step 4: Double-check backup points to current HEAD**

```bash
git log --oneline backup/pre-rollback-2026-01-30 -1
```

Expected: `8c07608 fix: restore sidebar resize feature lost in monaco squash`

**STOP if backup verification fails. Do not proceed without confirmed backup.**

---

## Task 2: Reset Main to Good State

**Files:** None (git operations only)

**Step 1: Hard reset to f25a6a2**

```bash
git reset --hard f25a6a2
```

**Step 2: Verify reset succeeded**

```bash
git log --oneline -1
```

Expected: `f25a6a2 feat: add precheck to detect running freshell before npm run dev`

**Step 3: Verify key files exist**

```bash
ls scripts/precheck.js src/store/sessionActivitySlice.ts src/lib/deriveTabName.ts
```

Expected: All three files exist

---

## Task 3: Cherry-Pick Settings Migration

**Files:** `src/store/settingsSlice.ts`

**Step 1: Cherry-pick the settings migration commit**

```bash
git cherry-pick 8491838
```

**Step 2: If conflict occurs, resolve and continue**

```bash
# View conflicts
git status

# After resolving conflicts in editor:
git add .
git cherry-pick --continue
```

**Step 2a: If you need to abort and start over**

```bash
git cherry-pick --abort
# You're back to f25a6a2, safe to retry
```

**Step 3: Verify cherry-pick succeeded**

```bash
git log --oneline -1
```

Expected: Shows commit with message about settings migration

**Step 4: Verify migrateSortMode function exists**

```bash
grep -n "migrateSortMode" src/store/settingsSlice.ts
```

Expected: Shows the function definition

---

## Task 4: Merge Monaco Feature Branch

**Files:** Multiple monaco files

**Step 1: Merge the monaco branch tip**

```bash
git merge 4503289 --no-ff -m "feat: monaco editor pane (proper merge)"
```

**Step 2: If conflicts occur**

Git will list conflicted files. For each:

```bash
# See what's conflicting
git diff --name-only --diff-filter=U

# Open each file, look for <<<<<<< markers, resolve manually
# Keep BOTH the main changes AND the monaco changes where possible
```

Common conflict resolutions:
- `package.json`: Keep both sets of dependencies
- `server/index.ts`: Keep .js extensions AND add files router import/mount
- `paneTypes.ts`: Keep paneTitles AND EditorPaneContent
- `PaneContainer.tsx`: Keep pane titles logic AND editor pane case

After resolving all conflicts:

```bash
git add .
git commit -m "feat: monaco editor pane (proper merge)"
```

**Step 2a: If you need to abort the merge**

```bash
git merge --abort
# You're back to post-cherry-pick state, safe to retry
```

**Step 3: Verify merge succeeded**

```bash
git log --oneline -3
```

Expected: Shows merge commit, then settings migration, then f25a6a2

**Step 4: Verify monaco files exist**

```bash
ls src/components/panes/EditorPane.tsx server/files-router.ts test/integration/client/editor-pane.test.tsx
```

Expected: All three files exist

---

## Task 5: Run Tests

**Files:** None (verification only)

**Step 1: Install dependencies (in case package.json changed)**

```bash
npm install
```

**Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 3: If tests fail**

Common issues after merge:
- Missing imports → add them
- Type errors → check merged types are complete
- Test file conflicts → ensure both test suites are present

Fix issues and commit:

```bash
git add .
git commit -m "fix: resolve post-merge test issues"
```

---

## Task 6: Verify Full Functionality

**Files:** None (verification only)

**Step 1: Verify activity sorting exists**

```bash
grep -l "sessionActivitySlice" src/store/*.ts
grep "lastInputAt" src/store/types.ts
```

Expected: sessionActivitySlice.ts exists, lastInputAt field defined

**Step 2: Verify pane titles exist**

```bash
grep "paneTitles" src/store/panesSlice.ts
grep "updatePaneTitle" src/store/panesSlice.ts
```

Expected: Both patterns found

**Step 3: Verify session auto-association exists**

```bash
grep "findUnassociatedClaudeTerminals" server/terminal-registry.ts
grep "setResumeSessionId" server/terminal-registry.ts
```

Expected: Both methods found

**Step 4: Verify monaco editor exists**

```bash
grep "EditorPane" src/components/panes/PaneContainer.tsx
grep "files-router" server/index.ts
```

Expected: Both patterns found

---

## Task 7: Build and Manual Test

**Files:** None (verification only)

**Step 1: Build the project**

```bash
npm run build
```

Expected: Build succeeds with no errors

**Step 2: Start dev server**

```bash
npm run dev
```

Expected: Server starts, no console errors

**Step 3: Manual verification checklist**

Open browser to http://localhost:5173 and verify:

- [ ] Sidebar can be resized by dragging the divider
- [ ] Sidebar collapse button works
- [ ] Activity sorting works (recently typed terminals sort higher)
- [ ] Click FAB (+) button → Editor option appears
- [ ] Editor pane can load a file (enter a path)
- [ ] Editor can save changes
- [ ] Terminal titles update from shell

---

## Task 8: Push to Remote

**Files:** None (git operations only)

**Step 1: Review what will be pushed**

```bash
git log --oneline origin/main..HEAD
```

Expected: Shows the merge commit, settings migration, and all the commits from f25a6a2

**Step 2: Force push with lease**

```bash
git push --force-with-lease origin main
```

Note: `--force-with-lease` is safer than `--force`. It will fail if someone else pushed to origin/main since your last fetch.

**Step 3: Verify push succeeded**

```bash
git log --oneline origin/main -5
```

Expected: Shows your new history

---

## Emergency Escape Hatches

### During cherry-pick (Task 3)

```bash
git cherry-pick --abort
# Returns to f25a6a2
```

### During merge (Task 4)

```bash
git merge --abort
# Returns to post-cherry-pick state
```

### After merge but before push (Tasks 5-7)

```bash
git reset --hard f25a6a2
# Start over from Task 3
```

### After push (Task 8) - Full rollback

```bash
git reset --hard backup/pre-rollback-2026-01-30
git push --force origin main
# Returns to the broken but working state we started from
```

### Nuclear option - recover from reflog

Even if backup branch is deleted:

```bash
git reflog | grep "8c07608"
git reset --hard 8c07608
```

---

## Summary

This plan:
1. Creates a verified safety backup branch
2. Resets main to f25a6a2 (the last good state)
3. Cherry-picks the one new commit (settings migration)
4. Does a proper 3-way merge of monaco branch tip
5. Runs tests and verifies all functionality
6. Force pushes the corrected history

**Why merge instead of 20 cherry-picks:**
- Git's 3-way merge is smarter at combining changes
- Fewer individual conflict resolution points
- Preserves the monaco branch relationship in history
- Single merge commit is cleaner than 20 cherry-picked commits
