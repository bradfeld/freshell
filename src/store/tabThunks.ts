import { createAsyncThunk } from '@reduxjs/toolkit'
import { nanoid } from 'nanoid'
import { addTab, removeTab } from './tabsSlice'
import { initLayout, removeLayout } from './panesSlice'
import type { PaneContentInput } from './paneTypes'

export const createTabWithPane = createAsyncThunk(
  'tabs/createTabWithPane',
  async (
    {
      tabId,
      title,
      titleSetByUser,
      content,
    }: {
      tabId?: string
      title?: string
      titleSetByUser?: boolean
      content: PaneContentInput
    },
    { dispatch }
  ) => {
    const id = tabId || nanoid()
    dispatch(addTab({ id, title, titleSetByUser }))
    dispatch(initLayout({ tabId: id, content }))
    return id
  }
)

export const closeTabWithCleanup = createAsyncThunk(
  'tabs/closeTabWithCleanup',
  async (
    { tabId, killTerminals }: { tabId: string; killTerminals?: boolean },
    { dispatch }
  ) => {
    // Side-effects (detach/kill terminals, cancel/kill coding CLI sessions, activity cleanup)
    // are handled centrally in paneCleanupListeners via state diffs.
    dispatch({
      ...removeLayout({ tabId }),
      meta: { killTerminals: !!killTerminals },
    } as any)
    dispatch(removeTab(tabId))
  }
)
