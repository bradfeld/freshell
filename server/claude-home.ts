import os from 'os'
import path from 'path'

export function getClaudeHome(): string {
  // Claude Code stores logs in ~/.claude by default (Linux/macOS).
  // On Windows, set CLAUDE_HOME to a path you can access from Node (e.g. \\wsl$\\...).
  return process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude')
}

export function getClaudeProjectsDir(): string {
  return path.join(getClaudeHome(), 'projects')
}
