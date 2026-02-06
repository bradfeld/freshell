import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import SettingsView from '@/components/SettingsView'
import settingsReducer from '@/store/settingsSlice'

vi.mock('@/lib/api', () => ({
  api: {
    patch: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ valid: true }),
  },
}))

function createTestStore() {
  return configureStore({
    reducer: {
      settings: settingsReducer,
    },
    preloadedState: {
      settings: {
        settings: {
          theme: 'system',
          uiScale: 1,
          terminal: {
            fontSize: 14,
            fontFamily: 'monospace',
            lineHeight: 1.2,
            cursorBlink: true,
            scrollback: 5000,
            theme: 'auto',
          },
          safety: { autoKillIdleMinutes: 180, warnBeforeKillMinutes: 5 },
          sidebar: { sortMode: 'activity', showProjectBadges: true, width: 288, collapsed: false },
          panes: { defaultNewPane: 'ask' },
          codingCli: {
            enabledProviders: ['claude', 'codex'],
            providers: {},
          },
          logging: { debug: false },
        },
        loaded: true,
        lastSavedAt: Date.now(),
      },
    },
  })
}

describe('SettingsView coding CLI cwd', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders starting directory inputs for configured providers', () => {
    const store = createTestStore()
    render(
      <Provider store={store}>
        <SettingsView />
      </Provider>
    )
    expect(screen.getByLabelText('Claude starting directory')).toBeInTheDocument()
    expect(screen.getByLabelText('Codex starting directory')).toBeInTheDocument()
  })

  it('starting directory inputs have correct placeholder', () => {
    const store = createTestStore()
    render(
      <Provider store={store}>
        <SettingsView />
      </Provider>
    )
    const claudeInput = screen.getByLabelText('Claude starting directory')
    expect(claudeInput).toHaveAttribute('placeholder', 'e.g. ~/projects/my-app')
  })
})
