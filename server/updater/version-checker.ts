// server/updater/version-checker.ts
import type { GitHubRelease, UpdateCheckResult } from './types.js'

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/danshapiro/freshell/releases/latest'

export function parseVersion(version: string): string {
  return version.startsWith('v') ? version.slice(1) : version
}

export function isNewerVersion(current: string, remote: string): boolean {
  const currentParts = current.split('.').map(Number)
  const remoteParts = remote.split('.').map(Number)

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0
    const r = remoteParts[i] || 0
    if (r > c) return true
    if (r < c) return false
  }

  return false
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Freshell-Updater'
      }
    })

    if (!response.ok) {
      return {
        updateAvailable: false,
        currentVersion,
        latestVersion: null,
        releaseUrl: null,
        error: `GitHub API returned ${response.status}`
      }
    }

    const release: GitHubRelease = await response.json()
    const latestVersion = parseVersion(release.tag_name)

    return {
      updateAvailable: isNewerVersion(currentVersion, latestVersion),
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url,
      error: null
    }
  } catch (err: any) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      releaseUrl: null,
      error: err?.message || String(err)
    }
  }
}
