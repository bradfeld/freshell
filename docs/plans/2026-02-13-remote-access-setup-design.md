# Remote Access Setup Experience

**Date:** 2026-02-13
**Status:** Design
**Supersedes:** PR #17 (bind to localhost by default)

## Problem

Freshell binds to `0.0.0.0` (all network interfaces) by default, exposing the server — including the unauthenticated `/local-file` endpoint — to anyone on the local network. PR #17 proposes binding to localhost by default, but simply flipping the default without a setup experience leaves users who *want* remote access to figure out firewall configuration, port forwarding, and IP addresses on their own.

Meanwhile, users on the same WiFi (e.g., phone) often can't connect even though the server is ostensibly network-accessible, due to platform-specific firewall rules, WSL2 port forwarding issues, or Windows network profile restrictions.

## Goals

1. **Secure by default:** Bind to localhost only until the user explicitly opts in.
2. **Guided setup:** A browser-based wizard that detects the platform, configures networking, opens firewall ports, and provides a QR code for phone access.
3. **Three entry points:** First-run wizard, Settings > Network Access, and a Share button in the top bar.
4. **Cross-platform:** Windows (native + WSL2), macOS, and Linux (ufw + firewalld).
5. **Minimal custom code:** Lean on well-maintained libraries for mDNS, QR codes, IP detection, and port reachability.

## Non-Goals

- UPnP/NAT-PMP router port forwarding (future work)
- Tailscale/Cloudflare tunnel integration (future work)
- Multi-user auth or scoped/time-limited tokens (future work)
- Built-in TLS/HTTPS (reverse proxy remains the recommended approach)

## Architecture

### Server: NetworkManager

A new module `server/network-manager.ts` that owns all network concerns:

**Responsibilities:**
- Read/write network config from `~/.freshell/config.json` (`settings.network`)
- Hot rebind the HTTP server (close listener, re-listen on new host) without process restart
- Start/stop mDNS advertising via `bonjour-service`
- Detect platform and firewall status
- Expose network state via REST API

**Config schema addition** (`settings.network`):
```ts
network: {
  host: '127.0.0.1' | '0.0.0.0'  // bind address, default '127.0.0.1'
  configured: boolean              // has the user completed setup?
  mdns: {
    enabled: boolean
    hostname: string               // default 'freshell', advertised as <hostname>.local
  }
}
```

**API endpoints:**
- `GET /api/network/status` — returns current network state (see schema below)
- `POST /api/network/configure` — accepts config changes, performs hot rebind, triggers firewall config

**Network status response:**
```ts
{
  configured: boolean
  host: '127.0.0.1' | '0.0.0.0'
  port: number
  lanIps: string[]
  mdns: { enabled: boolean, hostname: string } | null
  firewall: {
    platform: 'linux-ufw' | 'linux-firewalld' | 'macos' | 'windows' | 'wsl2'
    active: boolean
    portOpen: boolean | null
  }
  devMode: boolean
  accessUrl: string
}
```

### Hot Rebind

When network config changes, the server performs an in-process rebind:

1. Broadcast `network.restarting` to all WebSocket clients
2. Close all WebSocket connections
3. `server.close()` — stop accepting new connections
4. `server.listen(port, newHost)` — rebind to new interface
5. Clients auto-reconnect via existing WebSocket reconnection logic
6. Broadcast `network.ready` with updated status

PTY processes, scrollback buffers, and all in-memory state survive because nothing is tied to the HTTP listener. On first run there are zero connections, so it's instantaneous and invisible.

### Dev Mode

In dev mode, two servers run: Vite (default 5173) and Express (default 3001). Users connect to Vite, which proxies to Express.

- Express: hot-rebinds via NetworkManager
- Vite: reads `settings.network.host` from `~/.freshell/config.json` in `vite.config.ts` (replacing the hardcoded `host: true`). Vite restarts are manual in dev mode but Vite's watch mode handles this naturally.
- Firewall commands open all relevant ports (both Vite and Express ports in dev mode, just Express in production)
- All port references are dynamic — never hardcoded to 3001 or 5173

### Platform Firewall Module

A module `server/firewall.ts` with three functions:

**`detectFirewall(): Promise<FirewallInfo>`**
Detects the active firewall and whether the port is open:
- Linux: `ufw status` → `firewall-cmd --state` → assumes none
- macOS: `defaults read /Library/Preferences/com.apple.alf globalstate`
- Windows: `netsh advfirewall show currentprofile state`
- WSL2: detects WSL, checks Windows firewall via interop

**`firewallCommands(platform, ports): string[]`**
Returns the shell commands needed to open the ports. Pure data, no execution:
- Linux/ufw: `sudo ufw allow <port>/tcp`
- Linux/firewalld: `sudo firewall-cmd --add-port=<port>/tcp --permanent && sudo firewall-cmd --reload`
- macOS: `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add $(which node) --unblockapp $(which node)`
- Windows/WSL2: existing PowerShell elevation script from `wsl-port-forward.ts`

**`configureFirewall(platform, ports): void`**
Executes the commands by opening a terminal pane:
- Linux/macOS: opens a terminal pane running the `sudo` command; user authenticates naturally through the PTY
- WSL2: uses the existing UAC elevation path from `wsl-port-forward.ts`
- NetworkManager watches terminal output for a success marker to update status

### mDNS

Using `bonjour-service` to advertise Freshell on the local network:
```ts
bonjour.publish({ name: hostname, type: 'http', port })
```

The hostname is configurable (default: `freshell`), so the service is reachable at `http://freshell.local:<port>`. The `bonjour-service` package handles mDNS deduplication automatically (appends `-2`, `-3`, etc. if name conflicts exist).

Started by NetworkManager when remote access is enabled. Stopped when disabled.

## UI Design

### Three Entry Points, One Component

All three entry points render variations of the same `NetworkAccess` component consuming `GET /api/network/status`.

### Entry Point 1: First-Run Wizard

Full-page overlay when `configured === false`.

**Step 1 — "Set up Freshell so you can use it from your phone and other computers?"**
- "Yes, set it up" → step 2
- "No, just this computer" → sets localhost, marks configured, done

**Step 2 — Configuration**
Shows a checklist that progresses automatically:
1. Binding to network... (hot rebind to `0.0.0.0`)
2. Setting up local discovery... (mDNS start, with hostname text field)
3. Checking firewall... → auto-checks as done, or pauses with "Configure now" button that opens a terminal pane for the `sudo` command

**Step 3 — "You're all set"**
- QR code of the access URL (via `lean-qr` React component)
- Copyable URL text
- mDNS hostname display (`http://freshell.local:<port>`)
- Link to Settings for future changes

### Entry Point 2: Settings > Network Access

A section in the existing Settings panel:
- **Remote access** toggle (on/off → triggers hot rebind)
- **mDNS hostname** text field
- **Firewall status** indicator with "Fix" button if port is blocked
- **Access info** — LAN IP, mDNS name, QR code, copyable URL
- **Port** display (read-only, reflects PORT env var)

### Entry Point 3: Share Button

A button in the top bar. Behavior depends on state:
- **Not configured:** Opens the first-run wizard (step 1)
- **Configured, localhost-only:** Opens wizard at step 2 ("remote access isn't enabled yet")
- **Configured, remote enabled:** Opens a popover showing QR code, access URL, mDNS hostname, and network status indicator

## Security

This design resolves the security concern from PR #17:
- Default binding is `127.0.0.1` — nothing exposed until explicit opt-in
- The `/local-file` endpoint gets `httpAuthMiddleware` added (one-line fix, regardless of this feature)
- `ALLOWED_ORIGINS` auto-builds from actual bind state and detected IPs
- Auth token mechanism unchanged (already solid)
- PR #17 can be superseded by this work

## Dependencies

| Package | Purpose | Weekly Downloads | Size | ESM/TS |
|---------|---------|-----------------|------|--------|
| `bonjour-service` | mDNS advertising | 8.2M | Pure JS | TS |
| `lean-qr` | QR code (server + React component) | 12K | <4kB | ESM, TS |
| `internal-ip` | Reliable LAN IP detection | 3M | Small | ESM, TS |
| `is-port-reachable` | Port reachability diagnostics | 23M | Small | ESM |

No elevation library needed — firewall commands run in Freshell's own terminal panes.

## Testing Strategy

**Unit tests:**
- NetworkManager: hot rebind cycle (mock `server.close`/`server.listen`), config read/write, mDNS start/stop
- Firewall module: detection and command generation per platform (mocked shell output)
- Config schema: network settings validation

**Integration tests:**
- Hot rebind: bind localhost → rebind 0.0.0.0 → verify listening interface
- API endpoints: `/api/network/status` response shape, `/api/network/configure` config persistence
- ALLOWED_ORIGINS: auto-build from network state

**E2E tests:**
- Wizard flow: first-run → "yes" → configuration checklist → QR code display
- Share button: unconfigured state → opens wizard; configured state → shows QR popover
- Settings toggle: enable/disable remote access round-trip

**Platform-specific (mocked):**
- ufw active/inactive, firewalld active/inactive
- macOS firewall on/off
- WSL2 detection and Windows firewall
- Multiple LAN IPs, nonstandard ports

## Relationship to Existing Code

| Existing Code | Change |
|---------------|--------|
| `server/index.ts` line 787 `server.listen(port, '0.0.0.0')` | Reads host from config via NetworkManager |
| `server/bootstrap.ts` LAN IP detection | Replaced by `internal-ip` in NetworkManager |
| `server/bootstrap.ts` ALLOWED_ORIGINS building | Moved to NetworkManager, dynamic based on bind state |
| `server/wsl-port-forward.ts` | Becomes on-demand, triggered by firewall module instead of automatic |
| `server/auth.ts` `/local-file` endpoint | Gets `httpAuthMiddleware` added |
| `vite.config.ts` `host: true` | Reads from `config.json` instead |
| Context menu "Copy freshell token link" | Coexists with new Share button |
