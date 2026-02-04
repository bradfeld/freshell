import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import panesReducer from '@/store/panesSlice'
import settingsReducer from '@/store/settingsSlice'
import BrowserPane from '@/components/panes/BrowserPane'

// Mock clipboard
vi.mock('@/lib/clipboard', () => ({
  copyText: vi.fn(),
}))

// Mock pane-action-registry to avoid side effects
vi.mock('@/lib/pane-action-registry', () => ({
  registerBrowserActions: vi.fn(() => () => {}),
}))

// Mock API for port forwarding
vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ forwardedPort: 45678 }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  },
}))

import { api } from '@/lib/api'

const createMockStore = () =>
  configureStore({
    reducer: {
      panes: panesReducer,
      settings: settingsReducer,
    },
  })

function renderBrowserPane(
  props: Partial<React.ComponentProps<typeof BrowserPane>> = {},
  store = createMockStore(),
) {
  const defaultProps = {
    paneId: 'pane-1',
    tabId: 'tab-1',
    url: '',
    devToolsOpen: false,
    ...props,
  }
  return {
    ...render(
      <Provider store={store}>
        <BrowserPane {...defaultProps} />
      </Provider>,
    ),
    store,
  }
}

describe('BrowserPane', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
    cleanup()
  })

  function setWindowHostname(hostname: string) {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, hostname },
      writable: true,
      configurable: true,
    })
  }

  describe('rendering', () => {
    it('renders URL input and navigation buttons', () => {
      renderBrowserPane()

      expect(screen.getByPlaceholderText('Enter URL...')).toBeInTheDocument()
      expect(screen.getByTitle('Back')).toBeInTheDocument()
      expect(screen.getByTitle('Forward')).toBeInTheDocument()
    })

    it('shows empty state when no URL is set', () => {
      renderBrowserPane({ url: '' })

      expect(screen.getByText('Enter a URL to browse')).toBeInTheDocument()
    })

    it('renders iframe when URL is provided', () => {
      renderBrowserPane({ url: 'https://example.com' })

      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      expect(iframe!.getAttribute('src')).toBe('https://example.com')
    })

    it('shows dev tools panel when devToolsOpen is true', () => {
      renderBrowserPane({ url: 'https://example.com', devToolsOpen: true })

      expect(screen.getByText('Developer Tools')).toBeInTheDocument()
    })

    it('hides dev tools panel when devToolsOpen is false', () => {
      renderBrowserPane({ url: 'https://example.com', devToolsOpen: false })

      expect(screen.queryByText('Developer Tools')).not.toBeInTheDocument()
    })
  })

  describe('navigation', () => {
    it('navigates when Enter is pressed in URL input', () => {
      renderBrowserPane()

      const input = screen.getByPlaceholderText('Enter URL...')
      fireEvent.change(input, { target: { value: 'example.com' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      // Should add https:// protocol
      expect(iframe!.getAttribute('src')).toBe('https://example.com')
    })

    it('preserves http:// protocol when specified', () => {
      setWindowHostname('localhost')
      renderBrowserPane()

      const input = screen.getByPlaceholderText('Enter URL...')
      fireEvent.change(input, { target: { value: 'http://localhost:3000' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      expect(iframe!.getAttribute('src')).toContain('localhost:3000')
    })
  })

  describe('file:// URL handling', () => {
    it('converts file:// URLs to /local-file API endpoint', () => {
      renderBrowserPane({ url: 'file:///home/user/index.html' })

      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      // The existing regex strips the leading slash after file:///
      expect(iframe!.getAttribute('src')).toBe(
        '/local-file?path=' + encodeURIComponent('home/user/index.html'),
      )
    })
  })

  describe('port forwarding for remote access', () => {
    it('requests a port forward for localhost URLs when accessing remotely', async () => {
      setWindowHostname('192.168.1.100')
      vi.mocked(api.post).mockResolvedValue({ forwardedPort: 45678 })

      await act(async () => {
        renderBrowserPane({ url: 'http://localhost:3000' })
      })

      expect(api.post).toHaveBeenCalledWith('/api/proxy/forward', { port: 3000 })

      await waitFor(() => {
        const iframe = document.querySelector('iframe')
        expect(iframe).toBeTruthy()
        expect(iframe!.getAttribute('src')).toBe('http://192.168.1.100:45678/')
      })
    })

    it('requests a port forward for 127.0.0.1 URLs when accessing remotely', async () => {
      setWindowHostname('192.168.1.100')
      vi.mocked(api.post).mockResolvedValue({ forwardedPort: 45679 })

      await act(async () => {
        renderBrowserPane({ url: 'http://127.0.0.1:8080' })
      })

      expect(api.post).toHaveBeenCalledWith('/api/proxy/forward', { port: 8080 })

      await waitFor(() => {
        const iframe = document.querySelector('iframe')
        expect(iframe).toBeTruthy()
        expect(iframe!.getAttribute('src')).toBe('http://192.168.1.100:45679/')
      })
    })

    it('preserves path and query when port forwarding', async () => {
      setWindowHostname('10.0.0.5')
      vi.mocked(api.post).mockResolvedValue({ forwardedPort: 55555 })

      await act(async () => {
        renderBrowserPane({ url: 'http://localhost:3000/api/data?q=test' })
      })

      expect(api.post).toHaveBeenCalledWith('/api/proxy/forward', { port: 3000 })

      await waitFor(() => {
        const iframe = document.querySelector('iframe')
        expect(iframe).toBeTruthy()
        expect(iframe!.getAttribute('src')).toBe('http://10.0.0.5:55555/api/data?q=test')
      })
    })

    it('does not request port forwarding when accessing locally', () => {
      setWindowHostname('localhost')
      renderBrowserPane({ url: 'http://localhost:3000' })

      expect(api.post).not.toHaveBeenCalled()

      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      expect(iframe!.getAttribute('src')).toBe('http://localhost:3000')
    })

    it('does not request port forwarding for non-localhost URLs', () => {
      setWindowHostname('192.168.1.100')
      renderBrowserPane({ url: 'https://example.com' })

      expect(api.post).not.toHaveBeenCalled()

      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      expect(iframe!.getAttribute('src')).toBe('https://example.com')
    })

    it('does not request port forwarding for file:// URLs when remote', () => {
      setWindowHostname('192.168.1.100')
      renderBrowserPane({ url: 'file:///home/user/index.html' })

      expect(api.post).not.toHaveBeenCalled()

      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      // file:// should still go through /local-file endpoint (existing regex strips leading /)
      expect(iframe!.getAttribute('src')).toBe(
        '/local-file?path=' + encodeURIComponent('home/user/index.html'),
      )
    })

    it('shows connecting state while port forward is pending', async () => {
      setWindowHostname('192.168.1.100')
      let resolveForward!: (value: { forwardedPort: number }) => void
      vi.mocked(api.post).mockReturnValue(
        new Promise((resolve) => {
          resolveForward = resolve
        }),
      )

      renderBrowserPane({ url: 'http://localhost:3000' })

      // Should show connecting state (no iframe yet)
      expect(screen.getByText(/Connecting/i)).toBeInTheDocument()
      expect(document.querySelector('iframe')).toBeNull()

      // Resolve the forward
      await act(async () => {
        resolveForward({ forwardedPort: 45678 })
      })

      // Now the iframe should appear
      await waitFor(() => {
        const iframe = document.querySelector('iframe')
        expect(iframe).toBeTruthy()
        expect(iframe!.getAttribute('src')).toBe('http://192.168.1.100:45678/')
      })
    })

    it('shows error when port forwarding fails', async () => {
      setWindowHostname('192.168.1.100')
      vi.mocked(api.post).mockRejectedValue(
        new Error('Failed to create port forward'),
      )

      await act(async () => {
        renderBrowserPane({ url: 'http://localhost:3000' })
      })

      await waitFor(() => {
        // Use exact string to avoid matching the description which also contains "Failed to connect"
        expect(screen.getByText('Failed to connect')).toBeInTheDocument()
      })
    })
  })
})
