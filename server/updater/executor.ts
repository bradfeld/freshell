// server/updater/executor.ts
import { exec as nodeExec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const defaultExecAsync = promisify(nodeExec)

export type UpdateStep = 'git-pull' | 'npm-install' | 'build'
export type UpdateStatus = 'running' | 'complete' | 'error'

export interface UpdateProgress {
  step: UpdateStep
  status: UpdateStatus
  error?: string
}

export interface UpdateResult {
  success: boolean
  error?: string
}

export type ExecAsyncFn = (command: string, options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

export async function executeUpdate(
  onProgress: (progress: UpdateProgress) => void,
  execAsync: ExecAsyncFn = defaultExecAsync
): Promise<UpdateResult> {
  const steps: { step: UpdateStep; command: string }[] = [
    { step: 'git-pull', command: 'git pull' },
    { step: 'npm-install', command: 'npm install' },
    { step: 'build', command: 'npm run build' }
  ]

  for (const { step, command } of steps) {
    onProgress({ step, status: 'running' })

    try {
      await execAsync(command, { cwd: projectRoot })
      onProgress({ step, status: 'complete' })
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      onProgress({ step, status: 'error', error: errorMsg })
      return { success: false, error: errorMsg }
    }
  }

  return { success: true }
}
