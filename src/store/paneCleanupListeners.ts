import { createListenerMiddleware } from '@reduxjs/toolkit'
import { cancelCodingCliRequest } from './codingCliSlice'
import { removePaneActivity } from './terminalActivitySlice'
import { getWsClient } from '@/lib/ws-client'
import type { PaneContent, PaneNode } from './paneTypes'

type CleanupMeta = {
  killTerminal?: boolean
  killTerminals?: boolean
}

function cleanupTerminal(terminalId: string, kill: boolean) {
  const ws = getWsClient()
  ws.send({ type: kill ? 'terminal.kill' : 'terminal.detach', terminalId })
}

function cancelTerminalCreate(requestId: string, kill: boolean) {
  const ws = getWsClient()
  ws.send({ type: 'terminal.create.cancel', requestId, ...(kill ? { kill: true } : {}) })
}

function cleanupSession(sessionId: string, opts: { pendingRequests?: Record<string, any> }, dispatch: (a: any) => void) {
  const pending = opts.pendingRequests?.[sessionId]
  if (pending) {
    dispatch(cancelCodingCliRequest({ requestId: sessionId }))
    return
  }
  const ws = getWsClient()
  ws.send({ type: 'codingcli.kill', sessionId })
}

type TerminalRef = {
  paneId: string
  terminalId?: string
  requestId?: string
}

type SessionRef = {
  paneId: string
  sessionId: string
}

function addCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1)
}

function collectRefs(layouts: Record<string, any> | null | undefined) {
  const terminalsByPane = new Map<string, TerminalRef>()
  const sessionsByPane = new Map<string, SessionRef>()
  const terminalIdCounts = new Map<string, number>()
  // Track all createRequestIds (even after terminalId is set) to prevent cancel churn on pending -> created transitions.
  const requestIdCounts = new Map<string, number>()
  const sessionIdCounts = new Map<string, number>()

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return

    if (node.type === 'leaf') {
      const paneId = typeof node.id === 'string' ? node.id : ''
      const content = node.content as PaneContent | undefined
      if (!paneId || !content || typeof content !== 'object') return

      if (content.kind === 'terminal') {
        const terminalId =
          typeof (content as any).terminalId === 'string' && (content as any).terminalId.length > 0
            ? (content as any).terminalId as string
            : undefined
        const requestId =
          typeof (content as any).createRequestId === 'string' && (content as any).createRequestId.length > 0
            ? (content as any).createRequestId as string
            : undefined

        terminalsByPane.set(paneId, { paneId, terminalId, requestId })
        if (terminalId) addCount(terminalIdCounts, terminalId)
        if (requestId) addCount(requestIdCounts, requestId)
      }

      if (content.kind === 'session') {
        const sessionId =
          typeof (content as any).sessionId === 'string' && (content as any).sessionId.length > 0
            ? (content as any).sessionId as string
            : undefined
        if (!sessionId) return
        sessionsByPane.set(paneId, { paneId, sessionId })
        addCount(sessionIdCounts, sessionId)
      }

      return
    }

    if (node.type === 'split' && Array.isArray(node.children) && node.children.length >= 2) {
      visit(node.children[0])
      visit(node.children[1])
    }
  }

  if (layouts && typeof layouts === 'object' && !Array.isArray(layouts)) {
    for (const node of Object.values(layouts)) {
      visit(node)
    }
  }

  return { terminalsByPane, sessionsByPane, terminalIdCounts, requestIdCounts, sessionIdCounts }
}

function isSameTerminal(prev: TerminalRef, next: TerminalRef | undefined): boolean {
  if (!next) return false
  if (prev.terminalId && next.terminalId && prev.terminalId === next.terminalId) return true
  if (prev.requestId && next.requestId && prev.requestId === next.requestId) return true
  return false
}

function isSameSession(prev: SessionRef, next: SessionRef | undefined): boolean {
  return !!next && prev.sessionId === next.sessionId
}

export function createPaneCleanupListenerMiddleware() {
  const listener = createListenerMiddleware()

  listener.startListening({
    predicate: (action) => typeof (action as any)?.type === 'string' && (action as any).type.startsWith('panes/'),
    effect: (action, api) => {
      const prevState: any = api.getOriginalState()
      const nextState: any = api.getState()

      const prevLayouts: Record<string, PaneNode> | undefined = prevState?.panes?.layouts
      const nextLayouts: Record<string, PaneNode> | undefined = nextState?.panes?.layouts
      if (prevLayouts === nextLayouts) return

      const meta = ((action as any)?.meta || {}) as CleanupMeta
      const kill = !!meta.killTerminal || !!meta.killTerminals

      const prev = collectRefs(prevLayouts)
      const next = collectRefs(nextLayouts)

      // Terminals: cleanup when a pane stops referencing a terminal lifecycle.
      for (const [paneId, prevTerm] of prev.terminalsByPane.entries()) {
        const nextTerm = next.terminalsByPane.get(paneId)
        if (isSameTerminal(prevTerm, nextTerm)) continue

        if (prevTerm.terminalId) {
          const remaining = next.terminalIdCounts.get(prevTerm.terminalId) || 0
          if (remaining === 0) cleanupTerminal(prevTerm.terminalId, kill)
        } else if (prevTerm.requestId) {
          const remaining = next.requestIdCounts.get(prevTerm.requestId) || 0
          if (remaining === 0) cancelTerminalCreate(prevTerm.requestId, kill)
        }

        // Activity is pane-scoped: remove it even if the terminal is shared elsewhere.
        api.dispatch(removePaneActivity({ paneId }))
      }

      // Sessions: cleanup when a pane stops referencing a sessionId, but only if it isn't referenced elsewhere.
      for (const [paneId, prevSession] of prev.sessionsByPane.entries()) {
        const nextSession = next.sessionsByPane.get(paneId)
        if (isSameSession(prevSession, nextSession)) continue

        const remaining = next.sessionIdCounts.get(prevSession.sessionId) || 0
        if (remaining > 0) continue

        cleanupSession(prevSession.sessionId, { pendingRequests: prevState?.codingCli?.pendingRequests }, api.dispatch)
      }
    },
  })

  return listener
}
