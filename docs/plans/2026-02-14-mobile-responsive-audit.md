# Freshell Mobile & Responsive Design Audit

**Date:** 2026-02-14

## Current State

Freshell is **desktop-first**. It has one mobile accommodation today — the sidebar auto-collapses at <768px and renders as an overlay. Beyond that: zero CSS media queries, zero Tailwind responsive utilities (`sm:`, `md:`, etc.), no touch gestures, no PWA support, no safe-area handling, and nearly every interactive element is below the 44x44px iOS minimum touch target.

### Touch Target Summary

| Component | Current Size | iOS Min (44x44) | Status |
|-----------|-------------|-----------------|--------|
| Tab bar height | h-10 (40px) | 44px | BELOW |
| New tab button | p-1 + 14x14 icon | 44x44px | 22x22px |
| Close button on tab | p-0.5 + 12x12 icon | 44x44px | 16x16px |
| Context menu items | py-2 + text | 44px | ~32px |
| Session action buttons | p-1.5 + 14x14 icon | 44x44px | 26x26px |
| Sidebar session items | py-2 | 44px | ~24px |
| Terminal search buttons | h-8 px-2 | 44x44px | 28-32px |
| Settings gear button | p-1 | 44x44px | 22x22px |
| Toggle switch | w-9 h-5 | 44px | 36px (marginal) |

### Key Gaps

- **No CSS media queries** — relies entirely on JS viewport detection at 768px
- **No Tailwind responsive utilities** — all layouts use fixed widths
- **No orientation detection** — doesn't adapt to portrait/landscape
- **No PWA support** — no service worker, no manifest, no offline capability
- **No virtual keyboard handling** — terminal hides behind soft keyboard
- **No touch gestures** — no swipe navigation, no pinch-to-zoom font
- **No safe-area support** — content renders behind notch/Dynamic Island on iOS
- **No pull-to-refresh prevention** — scrolling up in terminal triggers Chrome refresh

---

## Suggestions

### Navigation & Tab Management

**1. Swipe left/right on the terminal area to switch tabs.** When on the leftmost tab, swiping right opens the sidebar. Swiping left on the rightmost tab could open a "new tab" action sheet.

**2. Replace the tab bar with a minimal mobile tab strip on small screens.** Show only the active tab name centered, with left/right chevrons or swipe indicators. A tap on the tab name opens a scrollable tab picker sheet.

**3. Long-press on a tab to open the context menu** (already has dnd-kit touch support — extend this to show the context menu on long-press without drag movement).

**4. Add a mobile-friendly "tab switcher" overlay** (like browser tab grids on mobile Safari/Chrome). Tap a button to see all tabs as cards, tap one to switch.

**5. Swipe down from the top of the terminal to reveal the tab bar** if it's auto-hidden in a future fullscreen mode, instead of triggering browser pull-to-refresh.

### Touch Targets & Interactive Elements

**6. Increase all touch targets to minimum 44x44px on mobile.** The current state is severe — close buttons are 16x16px, new-tab button is 22x22px, session action buttons are 26x26px. On mobile breakpoints, add padding/min-height to meet the minimum.

**7. Increase tab bar height from 40px (`h-10`) to 48px on mobile** to accommodate larger touch targets and prevent mis-taps between tabs.

**8. Make sidebar session items taller on mobile** — currently ~24px with `py-2`. Should be 48px+ with generous padding for thumb navigation.

**9. Enlarge context menu items** from ~32px tall to 48px+ on mobile for comfortable tapping.

**10. Make the settings gear and header buttons larger on mobile** — currently 22x22px. Use `min-w-11 min-h-11` (44px) wrappers on mobile.

### Sidebar & Navigation

**11. Swipe right from the left edge to open the sidebar, swipe left to close it.** This is the standard mobile drawer gesture (like Gmail, Slack, etc.) and is far more discoverable than a tiny hamburger button.

**12. Add a semi-transparent backdrop tap-to-close for the sidebar overlay** (partially exists — make sure tapping the backdrop reliably closes it).

**13. On mobile, make sidebar full-width** instead of its fixed desktop width. A 200px sidebar on a 375px screen is awkward — commit to a full-screen slide-over.

**14. Add a "quick actions" floating button (FAB)** in the bottom-right on mobile — tap to get: new terminal, new Claude session, switch tab, open sidebar. Reduces reliance on the tiny top-bar buttons.

### Terminal & Keyboard

**15. Detect virtual keyboard open/close and resize the terminal accordingly.** The `visualViewport` API (`window.visualViewport.resize` event) reliably detects soft keyboard on iOS/Android. Without this, the terminal will be half-hidden behind the keyboard.

**16. Add `touch-action: none` to the terminal container** to prevent browser scroll/zoom interference while interacting with the terminal. The terminal handles its own scrolling via xterm.js.

**17. Add a mobile toolbar above the virtual keyboard** with common keys that are hard to type on mobile: `Tab`, `Ctrl`, `Esc`, `|`, arrow keys, `/`, `~`. This is critical for any terminal app on mobile (Termux, iSH, and Blink Shell all do this).

**18. Support pinch-to-zoom to change terminal font size** on mobile. Map pinch gestures to font-size adjustments instead of letting the browser zoom the whole page (which breaks the layout).

**19. Add `user-scalable=no` to the viewport meta tag** (or `maximum-scale=1`) to prevent accidental double-tap zoom on the terminal, which is the most common mobile annoyance in terminal apps. Pair this with the pinch-to-zoom font size feature above.

**20. Disable pull-to-refresh** with CSS `overscroll-behavior-y: contain` on the root element. Scrolling up in a terminal should scroll terminal history, never trigger Chrome's pull-to-refresh.

### Layout & Responsive Design

**21. Add Tailwind responsive breakpoints to the layout.** Currently zero `sm:`/`md:` utilities are used. Key spots: settings panel padding, form input widths, modal sizing, header layout.

**22. Make the settings panel responsive.** The terminal preview at `width: 40ch` (~360-400px) overflows a 375px screen. Fixed-width inputs (`w-40`, `max-w-xs`) should become `w-full` on mobile. The `max-w-2xl` container with `px-6` leaves only ~327px for content — reduce padding on mobile.

**23. Make the terminal search bar responsive.** Currently `w-52` (208px) fixed — on a 375px screen, the search bar + buttons risk overflow. Make it `w-full` or percentage-based on mobile with buttons stacking or becoming icons-only.

**24. Stack form labels above inputs on mobile** instead of side-by-side. Settings forms currently use inline label-input pairs that get cramped on narrow screens.

**25. Make the Claude chat settings popover full-width on mobile** instead of fixed `w-64` (256px). On a 375px screen it works but feels cramped — a bottom sheet pattern would be more natural.

### Safe Areas & Browser Chrome

**26. Add `viewport-fit=cover` to the viewport meta tag** and use `env(safe-area-inset-*)` CSS variables for padding. On iPhones with the notch/Dynamic Island, content currently renders behind the safe area.

**27. Use `100dvh` everywhere** (already done for root — ensure child components that need full height also use it). The dynamic viewport unit accounts for mobile browser chrome appearing/disappearing.

**28. Account for the iOS Safari bottom bar.** Interactive elements (like a FAB or toolbar) should be at least `env(safe-area-inset-bottom)` above the bottom to avoid the home indicator bar.

### PWA & Fullscreen

**29. Add a Web App Manifest (`manifest.json`)** with proper icons, `display: standalone`, theme color, and background color. This enables "Add to Home Screen" on both iOS and Android, giving Freshell a native-app feel with no browser chrome.

**30. Add a service worker** for offline shell — even if the WebSocket is disconnected, the UI should load and show a "reconnecting" state rather than a blank page. Cache the static assets.

**31. Support fullscreen mode on mobile** via the Fullscreen API. A button or gesture to go fullscreen removes all browser chrome and gives the terminal maximum screen real estate.

**32. Add Apple-specific meta tags**: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, and `apple-touch-icon` for proper iOS home screen behavior.

### Gestures & Interactions

**33. Two-finger swipe up/down for terminal scrollback** — disambiguate from single-finger text selection and browser scroll. This gives reliable access to terminal history on touch devices.

**34. Double-tap to select a word in the terminal, triple-tap for line** — mirror desktop double/triple-click behavior. xterm.js supports this but verify it works with touch events.

**35. Add haptic feedback (via `navigator.vibrate()`)** on key mobile interactions: tab switch, sidebar open/close, long-press context menu. Subtle 10ms vibrations make the UI feel more responsive.

**36. Shake to disconnect/reconnect** — a quick way to force-reconnect the WebSocket on mobile where network transitions (WiFi to LTE) are common.

### Session & History Views

**37. Make session/history items swipeable** — swipe left to delete, swipe right to quick-launch. Standard mobile list interaction pattern.

**38. Make the session action buttons (play, edit, delete) larger and spaced further apart on mobile** — currently 26x26px and clustered together, leading to mis-taps.

**39. Use a bottom sheet for session details on mobile** instead of navigating to a new view. The user stays oriented in the list.

### Orientation & Adaptive Layout

**40. Detect and optimize for landscape orientation on mobile.** Landscape on a phone gives a wide, short viewport — ideal for terminals. Auto-hide the tab bar and sidebar, maximize terminal real estate, show a thin status bar at the top.

**41. In portrait on phone, consider a vertically stacked layout** — tab bar on top, terminal in middle, mobile key toolbar at bottom — instead of trying to shrink the desktop layout.

**42. Support split-screen / Stage Manager on iPad** — respond to viewport changes dynamically (ResizeObserver is in place, but test that layout adapts gracefully to arbitrary viewport sizes).

### Performance & Network

**43. Reduce WebSocket message frequency on mobile** or batch terminal output more aggressively. Mobile radios have higher latency and battery cost per wake-up. The chunked session update support (already implemented) is a good start — extend this philosophy to terminal output.

**44. Add a "low bandwidth" mode** that reduces terminal scrollback buffer, disables AI summaries auto-fetch, and compresses WebSocket messages. Useful on metered mobile connections.

**45. Lazy-load the settings panel and history views** — on mobile, initial load size matters more. Code-split these routes so they load on demand.

---

## Priority Tiers

### Tier 1 — Must-haves for a usable mobile experience
- #6 (touch targets)
- #15 (virtual keyboard)
- #17 (key toolbar)
- #20 (disable pull-to-refresh)
- #11 (swipe sidebar)
- #19 (prevent double-tap zoom)
- #26 (safe areas)

### Tier 2 — Makes it feel good
- #1 (swipe tabs)
- #2 (mobile tab strip)
- #7 (tab bar height)
- #13 (full-width sidebar)
- #22 (responsive settings)
- #29 (PWA manifest)
- #27 (dvh everywhere)

### Tier 3 — Makes it feel great
- #14 (FAB)
- #18 (pinch-to-zoom font)
- #33 (two-finger scrollback)
- #37 (swipeable sessions)
- #40 (landscape optimization)
- #31 (fullscreen mode)
