// server/updater/types.ts
// Note: GitHubRelease type is now defined in version-checker.ts via Zod schema
// and re-exported from there for validation purposes

export interface UpdateCheckResult {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  error: string | null
}
