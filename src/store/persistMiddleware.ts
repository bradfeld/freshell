import type { Middleware } from '@reduxjs/toolkit'
import { nanoid } from 'nanoid'
import { deriveTabName } from '@/lib/deriveTabName'
import {
  PANES_SCHEMA_VERSION,
  PANES_STORAGE_KEY,
  parsePersistedPanesRaw,
  parsePersistedTabsRaw,
  TABS_SCHEMA_VERSION,
  TABS_STORAGE_KEY,
} from './persistedState'
import { broadcastPersistedRaw } from './persistBroadcast'

export const PERSIST_DEBOUNCE_MS = 500

export { TABS_SCHEMA_VERSION } from './persistedState'

const flushCallbacks = new Set<() => void>()
let flushListenersAttached = false

function notifyFlushCallbacks() {
  for (const cb of flushCallbacks) {
    try {
      cb()
    } catch {
      // ignore
    }
  }
}

function attachFlushListeners() {
  if (flushListenersAttached) return
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      notifyFlushCallbacks()
    }
  }
  const handlePageHide = () => {
    notifyFlushCallbacks()
  }

  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('beforeunload', handlePageHide)

  flushListenersAttached = true
}

function registerFlushCallback(cb: () => void) {
  flushCallbacks.add(cb)
  attachFlushListeners()
}

export function resetPersistFlushListenersForTests() {
  flushCallbacks.clear()
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function recoverTabsFromPanes(): any | null {
  if (!canUseStorage()) return null

  let raw: string | null = null
  try {
    raw = localStorage.getItem(PANES_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  const parsed = parsePersistedPanesRaw(raw)
  if (!parsed) return null

  const layouts = parsed.layouts
  if (!layouts || typeof layouts !== 'object' || Array.isArray(layouts)) return null

  const entries = Object.entries(layouts).filter(([tabId, node]) =>
    typeof tabId === 'string' && !!node && typeof node === 'object'
  )
  if (entries.length === 0) return null

  const now = Date.now()
  const recoveredTabs = entries.map(([tabId, node]) => {
    let title = 'Tab'
    try {
      title = deriveTabName(node as any)
    } catch {
      // ignore and use fallback
    }
    return {
      id: tabId,
      title,
      createdAt: now,
    }
  })

  const payload = {
    version: TABS_SCHEMA_VERSION,
    tabs: {
      activeTabId: recoveredTabs[0].id,
      tabs: recoveredTabs,
    },
  }

  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota
  }

  return payload
}

export function loadPersistedTabs(): any | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY)
    if (!raw) return recoverTabsFromPanes()

    const normalized = parsePersistedTabsRaw(raw)
    if (!normalized) return recoverTabsFromPanes()
    return normalized
  } catch {
    return recoverTabsFromPanes()
  }
}

/**
 * Migrate terminal pane content to include lifecycle fields.
 * Only runs if content is missing required fields.
 */
function migratePaneContent(content: any): any {
  if (!content || typeof content !== 'object') {
    return content
  }
  if (content.kind !== 'terminal') {
    return content
  }

  // Already has lifecycle fields - no migration needed
  if (content.createRequestId && content.status) {
    return content
  }

  return {
    ...content,
    createRequestId: content.createRequestId || nanoid(),
    status: content.status || 'creating',
    mode: content.mode || 'shell',
    shell: content.shell || 'system',
  }
}

function stripEditorContent(content: any): any {
  if (content?.kind !== 'editor') return content
  if (content.content === '') return content
  return {
    ...content,
    content: '',
  }
}

function stripEditorContentFromNode(node: any): any {
  if (!node) return node

  if (node.type === 'leaf') {
    const nextContent = stripEditorContent(node.content)
    if (nextContent === node.content) return node
    return {
      ...node,
      content: nextContent,
    }
  }

  if (node.type === 'split') {
    if (!Array.isArray(node.children) || node.children.length < 2) {
      return node
    }
    const left = stripEditorContentFromNode(node.children[0])
    const right = stripEditorContentFromNode(node.children[1])
    if (left === node.children[0] && right === node.children[1]) return node
    return {
      ...node,
      children: [left, right],
    }
  }

  return node
}

/**
 * Recursively migrate all pane nodes in a tree.
 */
function migrateNode(node: any): any {
  if (!node) return node

  if (node.type === 'leaf') {
    return {
      ...node,
      content: migratePaneContent(node.content),
    }
  }

  if (node.type === 'split') {
    if (!Array.isArray(node.children) || node.children.length < 2) {
      return node
    }
    return {
      ...node,
      children: [
        migrateNode(node.children[0]),
        migrateNode(node.children[1]),
      ],
    }
  }

  return node
}

function readPersistedTabIdSet(): Set<string> | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY)
    if (!raw) return null

    // Keep this intentionally simple: we only need the IDs, and we must avoid recursion into recovery.
    const normalized = parsePersistedTabsRaw(raw)
    if (!normalized) return null
    const tabs = normalized.tabs.tabs

    const ids = tabs
      .map((t: any) => t?.id)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
    return new Set(ids)
  } catch {
    return null
  }
}

function collectLeafIds(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'leaf') {
    if (typeof node.id === 'string') out.push(node.id)
    return out
  }
  if (node.type === 'split' && Array.isArray(node.children) && node.children.length >= 2) {
    collectLeafIds(node.children[0], out)
    collectLeafIds(node.children[1], out)
  }
  return out
}

function repairActivePane(
  layouts: Record<string, any>,
  activePane: Record<string, any>
): { activePane: Record<string, string>; changed: boolean } {
  let changed = false
  const next: Record<string, string> = {}

  for (const [tabId, node] of Object.entries(layouts)) {
    const leafIds = collectLeafIds(node)
    if (leafIds.length === 0) continue

    const desired = activePane?.[tabId]
    if (typeof desired === 'string' && leafIds.includes(desired)) {
      next[tabId] = desired
      continue
    }
    // Default: match panesSlice closePane behavior (last leaf).
    next[tabId] = leafIds[leafIds.length - 1]
    changed = true
  }

  // Drop entries for tabs that no longer exist.
  for (const key of Object.keys(activePane || {})) {
    if (!(key in layouts)) {
      changed = true
    }
  }

  return { activePane: next, changed }
}

function prunePaneTitleMaps(
  layouts: Record<string, any>,
  paneTitles: Record<string, any>,
  paneTitleSetByUser: Record<string, any>
): { paneTitles: Record<string, any>; paneTitleSetByUser: Record<string, any>; changed: boolean } {
  let changed = false
  const nextTitles: Record<string, any> = {}
  const nextUser: Record<string, any> = {}

  for (const [tabId, node] of Object.entries(layouts)) {
    const leafSet = new Set(collectLeafIds(node))
    const titlesForTab = paneTitles?.[tabId]
    const userForTab = paneTitleSetByUser?.[tabId]

    if (titlesForTab && typeof titlesForTab === 'object' && !Array.isArray(titlesForTab)) {
      const pruned: Record<string, string> = {}
      for (const [paneId, title] of Object.entries(titlesForTab)) {
        if (!leafSet.has(paneId)) {
          changed = true
          continue
        }
        if (typeof title === 'string') pruned[paneId] = title
      }
      if (Object.keys(pruned).length > 0) nextTitles[tabId] = pruned
    }

    if (userForTab && typeof userForTab === 'object' && !Array.isArray(userForTab)) {
      const pruned: Record<string, boolean> = {}
      for (const [paneId, flag] of Object.entries(userForTab)) {
        if (!leafSet.has(paneId)) {
          changed = true
          continue
        }
        if (typeof flag === 'boolean') pruned[paneId] = flag
      }
      if (Object.keys(pruned).length > 0) nextUser[tabId] = pruned
    }
  }

  // Drop tab entries that no longer exist.
  for (const tabId of Object.keys(paneTitles || {})) {
    if (!(tabId in layouts)) changed = true
  }
  for (const tabId of Object.keys(paneTitleSetByUser || {})) {
    if (!(tabId in layouts)) changed = true
  }

  return { paneTitles: nextTitles, paneTitleSetByUser: nextUser, changed }
}

export function loadPersistedPanes(): any | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(PANES_STORAGE_KEY)
    if (!raw) return null
    const parsed = parsePersistedPanesRaw(raw)
    if (!parsed) return null

    let currentVersion = parsed.version

    // Run migrations
    let layouts = parsed.layouts || {}
    let paneTitles = parsed.paneTitles || {}
    let paneTitleSetByUser = parsed.paneTitleSetByUser || {}

    // Version 1 -> 2: migrate pane content to include lifecycle fields
    if (currentVersion < 2) {
      const migratedLayouts: Record<string, any> = {}
      for (const [tabId, node] of Object.entries(layouts)) {
        migratedLayouts[tabId] = migrateNode(node)
      }
      layouts = migratedLayouts
    }

    // Version 2 -> 3: add paneTitles (already defaulted to {} above)
    // No additional migration needed, just ensure the field exists
    // Version 3 -> 4: paneTitles semantics changed; reset overrides
    if (currentVersion < 4) {
      paneTitles = {}
      paneTitleSetByUser = {}
    }

    const sanitizedLayouts: Record<string, any> = {}
    for (const [tabId, node] of Object.entries(layouts)) {
      sanitizedLayouts[tabId] = stripEditorContentFromNode(node)
    }

    let changed = currentVersion !== PANES_SCHEMA_VERSION

    // Prune orphaned layouts against tabs when possible.
    const tabIdSet = readPersistedTabIdSet()
    let repairedLayouts = sanitizedLayouts
    if (tabIdSet) {
      const pruned: Record<string, any> = {}
      for (const [tabId, node] of Object.entries(sanitizedLayouts)) {
        if (tabIdSet.has(tabId)) pruned[tabId] = node
        else changed = true
      }
      repairedLayouts = pruned
    }

    // Repair activePane to always point at an existing leaf.
    const repairedActive = repairActivePane(repairedLayouts, parsed.activePane || {})
    if (repairedActive.changed) changed = true

    // Prune title maps (tabId/paneId) to match current layouts.
    const prunedTitles = prunePaneTitleMaps(repairedLayouts, paneTitles, paneTitleSetByUser)
    if (prunedTitles.changed) changed = true

    const result = {
      layouts: repairedLayouts,
      activePane: repairedActive.activePane,
      paneTitles: prunedTitles.paneTitles,
      paneTitleSetByUser: prunedTitles.paneTitleSetByUser,
      version: PANES_SCHEMA_VERSION,
    }

    if (changed) {
      try {
        localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(result))
      } catch {
        // ignore quota
      }
    }

    return result
  } catch {
    return null
  }
}

export const persistMiddleware: Middleware = (store) => {
  let tabsDirty = false
  let panesDirty = false
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    flushTimer = null
    if (!canUseStorage()) return
    if (!tabsDirty && !panesDirty) return

    const state = store.getState() as any

    if (tabsDirty) {
      const tabsPayload = {
        version: TABS_SCHEMA_VERSION,
        tabs: {
          // Persist only stable tab state. Keep ephemeral UI fields out of storage.
          activeTabId: state.tabs.activeTabId,
          tabs: state.tabs.tabs,
        },
      }

      try {
        const raw = JSON.stringify(tabsPayload)
        localStorage.setItem(TABS_STORAGE_KEY, raw)
        broadcastPersistedRaw(TABS_STORAGE_KEY, raw)
      } catch {
        // ignore quota
      }
    }

    if (panesDirty) {
      try {
        const sanitizedLayouts: Record<string, any> = {}
        for (const [tabId, node] of Object.entries(state.panes.layouts)) {
          sanitizedLayouts[tabId] = stripEditorContentFromNode(node)
        }
        const panesPayload = {
          ...state.panes,
          layouts: sanitizedLayouts,
          version: PANES_SCHEMA_VERSION,
        }
        const panesJson = JSON.stringify(panesPayload)
        localStorage.setItem(PANES_STORAGE_KEY, panesJson)
        broadcastPersistedRaw(PANES_STORAGE_KEY, panesJson)
      } catch (err) {
        console.error('[Panes Persist] Failed to save to localStorage:', err)
      }
    }

    tabsDirty = false
    panesDirty = false
  }

  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(flush, PERSIST_DEBOUNCE_MS)
  }

  const flushNow = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flush()
  }

  registerFlushCallback(flushNow)

  return (next) => (action: unknown) => {
    const result = next(action as any)

    const meta = (action as any)?.meta
    if (meta?.skipPersist) {
      return result
    }

    const actionType = (action as any)?.type
    if (typeof actionType === 'string') {
      if (actionType.startsWith('tabs/')) {
        tabsDirty = true
        scheduleFlush()
      }
      if (actionType.startsWith('panes/')) {
        panesDirty = true
        scheduleFlush()
      }
    }

    return result
  }
}
