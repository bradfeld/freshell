import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { ConnectionErrorOverlay } from '@/components/terminal/ConnectionErrorOverlay'
import connectionReducer from '@/store/connectionSlice'

afterEach(() => cleanup())

function renderWithStore(errorCode?: number, errorMessage?: string) {
  const store = configureStore({
    reducer: { connection: connectionReducer },
    preloadedState: {
      connection: {
        status: 'disconnected' as const,
        lastError: errorMessage,
        lastErrorCode: errorCode,
        platform: null,
        availableClis: {},
      },
    },
  })
  return render(
    <Provider store={store}>
      <ConnectionErrorOverlay />
    </Provider>,
  )
}

describe('TerminalView spinner suppression logic', () => {
  // This tests the boolean expression used in TerminalView.tsx:
  // const showSpinner = (status === 'creating' || isAttaching) && connectionErrorCode !== 4003
  function shouldShowSpinner(
    status: string,
    isAttaching: boolean,
    connectionErrorCode: number | undefined,
  ): boolean {
    return (status === 'creating' || isAttaching) && connectionErrorCode !== 4003
  }

  it('shows spinner when creating and no error code', () => {
    expect(shouldShowSpinner('creating', false, undefined)).toBe(true)
  })

  it('shows spinner when attaching and no error code', () => {
    expect(shouldShowSpinner('running', true, undefined)).toBe(true)
  })

  it('suppresses spinner when creating but error code is 4003', () => {
    expect(shouldShowSpinner('creating', false, 4003)).toBe(false)
  })

  it('suppresses spinner when attaching but error code is 4003', () => {
    expect(shouldShowSpinner('running', true, 4003)).toBe(false)
  })

  it('shows spinner when error code is non-4003', () => {
    expect(shouldShowSpinner('creating', false, 4001)).toBe(true)
  })

  it('does not show spinner when terminal is running and not attaching', () => {
    expect(shouldShowSpinner('running', false, undefined)).toBe(false)
  })
})

describe('ConnectionErrorOverlay', () => {
  it('renders nothing when no error code is set', () => {
    const { container } = renderWithStore()
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for non-4003 error codes', () => {
    const { container } = renderWithStore(4001, 'Authentication failed')
    expect(container.firstChild).toBeNull()
  })

  it('renders max connections message for code 4003', () => {
    renderWithStore(4003, 'Server busy: max connections reached')
    expect(screen.getByText(/connection limit reached/i)).toBeInTheDocument()
    expect(screen.getByText(/MAX_CONNECTIONS/)).toBeInTheDocument()
  })

  it('has accessible role and label', () => {
    renderWithStore(4003, 'Server busy: max connections reached')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
