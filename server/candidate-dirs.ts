import type { ProjectGroup } from './coding-cli/types.js'

type CandidateDirectoriesInput = {
  projects: ProjectGroup[]
  terminals: Array<{ cwd?: string }>
  recentDirectories?: string[]
  providerCwds?: Array<string | undefined>
  defaultCwd?: string
}

function addUniqueDirectory(next: string[], seen: Set<string>, value?: string) {
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  if (!trimmed || seen.has(trimmed)) return
  seen.add(trimmed)
  next.push(trimmed)
}

export function collectCandidateDirectories(input: CandidateDirectoriesInput): string[] {
  const directories: string[] = []
  const seen = new Set<string>()

  for (const project of input.projects) {
    addUniqueDirectory(directories, seen, project.projectPath)
    for (const session of project.sessions) {
      addUniqueDirectory(directories, seen, session.cwd)
    }
  }

  for (const terminal of input.terminals) {
    addUniqueDirectory(directories, seen, terminal.cwd)
  }

  for (const recent of input.recentDirectories || []) {
    addUniqueDirectory(directories, seen, recent)
  }

  for (const providerCwd of input.providerCwds || []) {
    addUniqueDirectory(directories, seen, providerCwd)
  }

  addUniqueDirectory(directories, seen, input.defaultCwd)
  return directories
}
