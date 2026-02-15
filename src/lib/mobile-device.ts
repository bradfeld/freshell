export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false

  try {
    if (window.matchMedia('(max-width: 767px)').matches) {
      return true
    }
  } catch {
    // Ignore matchMedia failures and continue with user-agent fallback.
  }

  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
}
