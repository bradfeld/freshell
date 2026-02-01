import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { markReady, clearReadyForTab, STREAMING_THRESHOLD_MS, INPUT_ECHO_WINDOW_MS } from '@/store/terminalActivitySlice'
import { useNotificationSound } from './useNotificationSound'
import type { PaneNode } from '@/store/paneTypes'

/** Extract all pane IDs from a pane tree */
function collectPaneIds(node: PaneNode | undefined): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.id]
  return [...collectPaneIds(node.children[0]), ...collectPaneIds(node.children[1])]
}

/**
 * Check if a pane is streaming based on last output time.
 * Filters out output that's likely just input echo (within INPUT_ECHO_WINDOW_MS of input).
 */
function isPaneStreaming(
  lastOutputAt: number | undefined,
  lastInputAt: number | undefined,
  now: number
): boolean {
  if (!lastOutputAt) return false
  // No recent output = not streaming
  if (now - lastOutputAt >= STREAMING_THRESHOLD_MS) return false
  // If there's been recent input, output might just be echo - don't count as streaming
  if (lastInputAt && now - lastInputAt < INPUT_ECHO_WINDOW_MS) return false
  return true
}

export interface TabActivityState {
  /** Terminal stopped streaming on background tab (needs attention) */
  isFinished: boolean
}

/**
 * Monitor terminal activity and handle transitions.
 *
 * States:
 * - Ready (default): green dot - terminal is idle (all tabs show this normally)
 * - Finished: green dot + blue tab bg - streaming stopped on background tab
 *
 * Rules:
 * - Active tab always shows ready (green)
 * - Finished is entered when background tab stops streaming
 * - Selecting a finished tab clears it to ready
 */
export function useTerminalActivityMonitor() {
  const dispatch = useAppDispatch()
  const { play: playSound } = useNotificationSound()

  const tabs = useAppSelector((s) => s.tabs.tabs)
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId)
  const layouts = useAppSelector((s) => s.panes.layouts)
  const lastOutputAt = useAppSelector((s) => s.terminalActivity.lastOutputAt)
  const lastInputAt = useAppSelector((s) => s.terminalActivity.lastInputAt)
  const ready = useAppSelector((s) => s.terminalActivity.ready)
  const notifications = useAppSelector((s) => s.settings.settings.notifications)

  // Track previous streaming state to detect transitions
  const prevStreamingRef = useRef<Record<string, boolean>>({})

  // Check if any pane is currently streaming (to know if we need timeout)
  const hasActiveStreaming = useMemo(() => {
    const now = Date.now()
    for (const paneId of Object.keys(lastOutputAt)) {
      if (isPaneStreaming(lastOutputAt[paneId], lastInputAt[paneId], now)) {
        return true
      }
    }
    return false
  }, [lastOutputAt, lastInputAt])

  // Callback to check for transitions
  const checkTransitions = useCallback(() => {
    const now = Date.now()

    // Calculate current streaming state (filtering out input echo)
    const currentStreaming: Record<string, boolean> = {}
    for (const paneId of Object.keys(lastOutputAt)) {
      currentStreaming[paneId] = isPaneStreaming(lastOutputAt[paneId], lastInputAt[paneId], now)
    }

    const prevStreaming = prevStreamingRef.current
    let shouldPlaySound = false

    for (const [paneId, wasStreaming] of Object.entries(prevStreaming)) {
      const isNowStreaming = currentStreaming[paneId] ?? false

      // Transition: streaming -> idle
      if (wasStreaming && !isNowStreaming) {
        // Find which tab this pane belongs to
        let ownerTabId: string | null = null
        for (const tab of tabs) {
          const layout = layouts[tab.id]
          const paneIds = collectPaneIds(layout)
          if (paneIds.includes(paneId)) {
            ownerTabId = tab.id
            break
          }
        }

        // Only mark finished if this isn't the active tab
        if (ownerTabId && ownerTabId !== activeTabId) {
          if (notifications?.visualWhenFinished) {
            dispatch(markReady({ paneId }))
          }
          if (notifications?.soundWhenFinished) {
            shouldPlaySound = true
          }
        }
      }
    }

    // Play sound (debounced by the hook)
    if (shouldPlaySound) {
      playSound()
    }

    prevStreamingRef.current = currentStreaming
  }, [lastOutputAt, lastInputAt, tabs, layouts, activeTabId, notifications, dispatch, playSound])

  // Run transition check when output changes
  useEffect(() => {
    checkTransitions()
  }, [checkTransitions])

  // Only run interval when there's active streaming (to detect when it stops)
  useEffect(() => {
    if (!hasActiveStreaming) return
    const interval = setInterval(checkTransitions, 1000)
    return () => clearInterval(interval)
  }, [hasActiveStreaming, checkTransitions])

  // Clear ready state when tab is selected
  useEffect(() => {
    if (!activeTabId) return

    const layout = layouts[activeTabId]
    const paneIds = collectPaneIds(layout)
    if (paneIds.length > 0) {
      dispatch(clearReadyForTab({ paneIds }))
    }
  }, [activeTabId, layouts, dispatch])

  // Compute activity states for all tabs (only finished state matters for display)
  const tabActivityStates = useMemo(() => {
    const states: Record<string, TabActivityState> = {}

    for (const tab of tabs) {
      const layout = layouts[tab.id]
      const paneIds = collectPaneIds(layout)

      let tabIsFinished = false
      for (const paneId of paneIds) {
        if (ready[paneId]) {
          tabIsFinished = true
          break
        }
      }

      const isActiveTab = tab.id === activeTabId

      // Finished: shown on background tabs that stopped streaming
      // Active tab always shows ready (green dot)
      states[tab.id] = {
        isFinished: notifications?.visualWhenFinished && !isActiveTab && tabIsFinished,
      }
    }

    return states
  }, [tabs, layouts, ready, notifications, activeTabId])

  return { tabActivityStates }
}
