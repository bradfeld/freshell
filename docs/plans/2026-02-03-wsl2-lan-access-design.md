# WSL2 LAN Access - Design

## Problem

When Freshell runs inside WSL2, the share button correctly detects the Windows host's LAN IP (e.g., `192.168.3.50`), but external devices can't actually connect because WSL2 uses NAT networking. The server binds to the WSL2 internal IP (`172.x.x.x`), which isn't reachable from the physical LAN.

## Solution

On server startup, automatically configure Windows port forwarding using `netsh` so external LAN devices can reach Freshell through the Windows host IP.

## Flow

1. **Detect WSL2** - Check `/proc/version` for "microsoft" (existing `isWSL2()`)
2. **Get WSL2 IP** - Parse `hostname -I` to get the `172.x.x.x` address
3. **Check existing rules** - Run `netsh interface portproxy show v4tov4`
4. **Compare** - Check if rules exist for ports 3001/5173 pointing to current WSL2 IP
5. **If missing/stale** - Launch elevated PowerShell to configure (triggers UAC)
6. **Log result** - Success, skipped, or failed

## Commands

When rules need updating:

```powershell
# Remove stale rules
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=5173 listenaddress=0.0.0.0

# Add current rules
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3001 connectaddress=<WSL_IP> connectport=3001
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=5173 connectaddress=<WSL_IP> connectport=5173

# Firewall rule
netsh advfirewall firewall delete rule name="Freshell LAN Access"
netsh advfirewall firewall add rule name="Freshell LAN Access" dir=in action=allow protocol=tcp localport=3001,5173
```

## Elevation

From WSL2, use PowerShell's `-Verb RunAs`:

```typescript
execSync(`powershell.exe -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-Command', '${script}'"`)
```

The `-Wait` flag blocks until the elevated process completes.

## File Structure

New file: `server/wsl-port-forward.ts`

- `getWslIp(): string | null`
- `getExistingPortProxyRules(): Map<number, string>`
- `needsPortForwardingUpdate(wslIp: string): boolean`
- `setupPortForwarding(): 'success' | 'skipped' | 'failed' | 'not-wsl2'`

Called from `server/bootstrap.ts` after `ensureEnvFile()`.

## Error Handling

- **UAC dismissed**: Log warning, continue (local access still works)
- **netsh fails**: Log error, continue
- **WSL IP not found**: Skip, log warning
- **Not WSL2**: No-op

## Logging

```
[wsl-port-forward] WSL2 detected, checking port forwarding...
[wsl-port-forward] Rules up to date for 172.30.149.249
```

or

```
[wsl-port-forward] Configuring port forwarding for 172.30.149.249...
[wsl-port-forward] UAC prompt required - please approve to enable LAN access
[wsl-port-forward] Port forwarding configured successfully
```
