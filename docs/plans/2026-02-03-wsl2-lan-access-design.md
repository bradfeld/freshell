# WSL2 LAN Access - Design

## Problem

When Freshell runs inside WSL2, the share button correctly detects the Windows host's LAN IP (e.g., `192.168.3.50`), but external devices can't actually connect because WSL2 uses NAT networking. The server binds to the WSL2 internal IP (`172.x.x.x`), which isn't reachable from the physical LAN.

## Solution

On server startup, automatically configure Windows port forwarding using `netsh` so external LAN devices can reach Freshell through the Windows host IP.

## Flow

1. **Detect WSL2** - Check `/proc/version` for "wsl2" or "microsoft-standard" patterns
2. **Get WSL2 IP** - Try eth0 interface first, fall back to `hostname -I` (skipping Docker bridge)
3. **Check existing rules** - Run `netsh interface portproxy show v4tov4`
4. **Compare** - Check if rules exist for required ports pointing to current WSL2 IP
5. **If missing/stale** - Launch elevated PowerShell to configure (triggers UAC)
6. **Verify** - Re-check rules after elevation to detect UAC cancellation
7. **Log result** - Success, skipped, or failed

## Commands

When rules need updating:

```powershell
# Remove stale rules (listenaddress=0.0.0.0 to match what we create)
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=3001
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=5173

# Add current rules
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3001 connectaddress=<WSL_IP> connectport=3001
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=5173 connectaddress=<WSL_IP> connectport=5173

# Firewall rule (profile=private for security, no spaces in name for escaping)
netsh advfirewall firewall delete rule name=FreshellLANAccess
netsh advfirewall firewall add rule name=FreshellLANAccess dir=in action=allow protocol=tcp localport=3001,5173 profile=private
```

## Elevation

From WSL2, use PowerShell's `-Verb RunAs` with absolute paths:

```typescript
const POWERSHELL_PATH = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
execSync(`${POWERSHELL_PATH} -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-Command', '${script}'"`)
```

The `-Wait` flag blocks until the elevated process completes. Absolute path avoids PATH issues.

## File Structure

New file: `server/wsl-port-forward.ts`

- `getWslIp(): string | null` - Get WSL2 IP (eth0 first, then hostname -I)
- `parsePortProxyRules(output: string): Map<number, PortProxyRule>`
- `getExistingPortProxyRules(): Map<number, PortProxyRule>`
- `getRequiredPorts(): number[]` - From PORT env and NODE_ENV
- `needsPortForwardingUpdate(wslIp, ports, rules): boolean`
- `buildPortForwardingScript(wslIp, ports): string`
- `setupWslPortForwarding(): SetupResult`

Called from `server/index.ts` inside `main()` after `validateStartupSecurity()`.

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
