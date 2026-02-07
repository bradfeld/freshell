import { closePane, updatePaneContent } from './panesSlice'
import type { PaneContent } from './paneTypes'
import type { AppDispatch } from './store'

export const swapPaneContent =
  ({
    tabId,
    paneId,
    content,
    killTerminal,
  }: {
    tabId: string
    paneId: string
    content: PaneContent
    killTerminal?: boolean
  }) =>
  (dispatch: AppDispatch) => {
    // Side-effects (detach/kill terminals, cancel/kill coding CLI sessions, activity cleanup)
    // are handled centrally in paneCleanupListeners via state diffs.
    dispatch({
      ...updatePaneContent({ tabId, paneId, content }),
      meta: { killTerminal: !!killTerminal },
    } as any)
  }

export const closePaneWithCleanup =
  ({
    tabId,
    paneId,
    killTerminal,
  }: {
    tabId: string
    paneId: string
    killTerminal?: boolean
  }) =>
  (dispatch: AppDispatch) => {
    // Side-effects (detach/kill terminals, cancel/kill coding CLI sessions, activity cleanup)
    // are handled centrally in paneCleanupListeners via state diffs.
    dispatch({
      ...closePane({ tabId, paneId }),
      meta: { killTerminal: !!killTerminal },
    } as any)
  }
