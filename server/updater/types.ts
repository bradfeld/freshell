// server/updater/types.ts
export interface GitHubRelease {
  tag_name: string
  html_url: string
  published_at: string
  body: string
}

export interface UpdateCheckResult {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  error: string | null
}
