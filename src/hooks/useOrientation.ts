import { useSyncExternalStore } from 'react'

const LANDSCAPE_QUERY = '(orientation: landscape)'

function getMql(): MediaQueryList {
  return window.matchMedia(LANDSCAPE_QUERY)
}

function subscribe(callback: () => void): () => void {
  const m = getMql()
  m.addEventListener('change', callback)
  window.addEventListener('resize', callback)
  return () => {
    m.removeEventListener('change', callback)
    window.removeEventListener('resize', callback)
  }
}

function getSnapshot(): boolean {
  if (!getMql().matches) return false
  // Landscape compact mode is intentionally phone-focused; large tablet viewports
  // should keep standard chrome even when orientation is landscape.
  return window.innerHeight <= 500
}

function getServerSnapshot(): boolean {
  return false
}

export function useOrientation(): { isLandscape: boolean } {
  const isLandscape = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { isLandscape }
}
