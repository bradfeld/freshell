import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

import tabsReducer from '@/store/tabsSlice'
import panesReducer from '@/store/panesSlice'
import sessionsReducer from '@/store/sessionsSlice'
import codingCliReducer from '@/store/codingCliSlice'
import settingsReducer, { defaultSettings } from '@/store/settingsSlice'
import sessionActivityReducer from '@/store/sessionActivitySlice'
import { ContextMenuProvider } from '@/components/context-menu/ContextMenuProvider'
import { ContextIds } from '@/components/context-menu/context-menu-constants'

vi.mock('@/lib/ws-client', () => ({
  getWsClient: () => ({
    send: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onReconnect: vi.fn().mockReturnValue(() => {}),
    setHelloExtensionProvider: vi.fn(),
  }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}))

function createTestStore() {
  return configureStore({
    reducer: {
      tabs: tabsReducer,
      panes: panesReducer,
      sessions: sessionsReducer,
      codingCli: codingCliReducer,
      settings: settingsReducer,
      sessionActivity: sessionActivityReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
    preloadedState: {
      tabs: {
        tabs: [
          {
            id: 'tab-1',
            title: 'Tab One',
            createdAt: 1,
          },
          {
            id: 'tab-2',
            title: 'Tab Two',
            createdAt: 2,
          },
        ],
        activeTabId: 'tab-1',
      },
      panes: {
        layouts: {},
        activePane: {},
        paneTitles: {},
        paneTitleSetByUser: {},
      },
      sessions: {
        projects: [],
        expandedProjects: new Set<string>(),
      },
      codingCli: {
        sessions: {},
        pendingRequests: {},
      },
      settings: {
        settings: defaultSettings,
        loaded: true,
      },
      sessionActivity: {
        sessions: {},
      },
    },
  })
}

function renderWithProvider(ui: React.ReactNode) {
  const store = createTestStore()
  const utils = render(
    <Provider store={store}>
      <ContextMenuProvider
        view="terminal"
        onViewChange={() => {}}
        onToggleSidebar={() => {}}
        sidebarCollapsed={false}
      >
        {ui}
      </ContextMenuProvider>
    </Provider>
  )
  return { store, ...utils }
}

describe('ContextMenuProvider', () => {
  afterEach(() => cleanup())
  it('opens menu on right click and dispatches close tab', async () => {
    const user = userEvent.setup()
    const { store } = renderWithProvider(
      <div data-context={ContextIds.Tab} data-tab-id="tab-1">
        Tab One
      </div>
    )

    await user.pointer({ target: screen.getByText('Tab One'), keys: '[MouseRight]' })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(screen.getByText('Close tab'))

    expect(store.getState().tabs.tabs).toHaveLength(1)
    expect(store.getState().tabs.tabs[0].id).toBe('tab-2')
  })

  it('closes menu on outside click', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <div>
        <div data-context={ContextIds.Tab} data-tab-id="tab-1">
          Tab One
        </div>
        <button type="button">Outside</button>
      </div>
    )

    await user.pointer({ target: screen.getByText('Tab One'), keys: '[MouseRight]' })
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByText('Outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('respects native menu for input-like elements', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <div data-context={ContextIds.Global}>
        <input aria-label="Name" />
      </div>
    )

    await user.pointer({ target: screen.getByLabelText('Name'), keys: '[MouseRight]' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('allows native menu when Shift is held', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <div data-context={ContextIds.Tab} data-tab-id="tab-1">
        Tab One
      </div>
    )

    await user.keyboard('{Shift>}')
    await user.pointer({ target: screen.getByText('Tab One'), keys: '[MouseRight]' })
    await user.keyboard('{/Shift}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens menu via keyboard context key', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <div data-context={ContextIds.Tab} data-tab-id="tab-1" tabIndex={0}>
        Tab One
      </div>
    )

    const target = screen.getByText('Tab One')
    await user.click(target)
    fireEvent.keyDown(document, { key: 'F10', shiftKey: true })

    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
