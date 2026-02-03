import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'
import type { Tab } from './types'
import { nanoid } from 'nanoid'
import { removeLayout } from './panesSlice'

export interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
}

// Load persisted tabs state directly at module initialization time
// This ensures the initial state includes persisted data BEFORE the store is created
function loadInitialTabsState(): TabsState {
  const defaultState: TabsState = {
    tabs: [],
    activeTabId: null,
  }

  try {
    const raw = localStorage.getItem('freshell.tabs.v1')
    if (!raw) return defaultState
    const parsed = JSON.parse(raw)
    // The persisted format is { tabs: TabsState }
    const tabsState = parsed?.tabs as TabsState | undefined
    if (!tabsState?.tabs) return defaultState

    console.log('[TabsSlice] Loaded initial state from localStorage:', tabsState.tabs.map(t => t.id))

    // Apply same transformations as hydrateTabs to ensure consistency
    return {
      tabs: tabsState.tabs.map((t: Tab) => {
        return {
          ...t,
          createdAt: t.createdAt || Date.now(),
        }
      }),
      activeTabId: tabsState.activeTabId || (tabsState.tabs[0]?.id ?? null),
    }
  } catch (err) {
    console.error('[TabsSlice] Failed to load from localStorage:', err)
    return defaultState
  }
}

const initialState: TabsState = loadInitialTabsState()

type AddTabPayload = {
  id?: string
  title?: string
  titleSetByUser?: boolean
}

export const tabsSlice = createSlice({
  name: 'tabs',
  initialState,
  reducers: {
    addTab: (state, action: PayloadAction<AddTabPayload | undefined>) => {
      const payload = action.payload || {}

      const id = payload.id || nanoid()
      const tab: Tab = {
        id,
        title: payload.title || `Tab ${state.tabs.length + 1}`,
        createdAt: Date.now(),
        titleSetByUser: payload.titleSetByUser,
      }
      state.tabs.push(tab)
      state.activeTabId = id
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTabId = action.payload
    },
    updateTab: (state, action: PayloadAction<{ id: string; updates: Partial<Tab> }>) => {
      const tab = state.tabs.find((t) => t.id === action.payload.id)
      if (tab) Object.assign(tab, action.payload.updates)
    },
    removeTab: (state, action: PayloadAction<string>) => {
      state.tabs = state.tabs.filter((t) => t.id !== action.payload)
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.tabs.length > 0 ? state.tabs[0].id : null
      }
    },
    hydrateTabs: (state, action: PayloadAction<TabsState>) => {
      // Basic sanity: ensure dates exist.
      state.tabs = (action.payload.tabs || []).map((t) => {
        return {
          ...t,
          createdAt: t.createdAt || Date.now(),
        }
      })
      state.activeTabId = action.payload.activeTabId || (state.tabs[0]?.id ?? null)
    },
    reorderTabs: (
      state,
      action: PayloadAction<{ fromIndex: number; toIndex: number }>
    ) => {
      const { fromIndex, toIndex } = action.payload
      if (fromIndex === toIndex) return
      const [removed] = state.tabs.splice(fromIndex, 1)
      state.tabs.splice(toIndex, 0, removed)
    },
  },
})

export const { addTab, setActiveTab, updateTab, removeTab, hydrateTabs, reorderTabs } = tabsSlice.actions

export const closeTab = createAsyncThunk(
  'tabs/closeTab',
  async (tabId: string, { dispatch }) => {
    dispatch(removeTab(tabId))
    dispatch(removeLayout({ tabId }))
  }
)

export default tabsSlice.reducer
