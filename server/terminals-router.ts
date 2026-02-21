import { Router } from 'express'
import { z } from 'zod'
import { cleanString } from './utils.js'

export const TerminalPatchSchema = z.object({
  titleOverride: z.string().max(500).optional().nullable(),
  descriptionOverride: z.string().max(2000).optional().nullable(),
  deleted: z.boolean().optional(),
})

export interface TerminalsRouterDeps {
  configStore: {
    snapshot: () => Promise<any>
    patchTerminalOverride: (id: string, data: any) => Promise<any>
    deleteTerminal: (id: string) => Promise<void>
  }
  registry: {
    list: () => any[]
    updateTitle: (id: string, title: string) => void
    updateDescription: (id: string, desc: string) => void
  }
  wsHandler: {
    broadcast: (msg: any) => void
  }
}

export function createTerminalsRouter(deps: TerminalsRouterDeps): Router {
  const { configStore, registry, wsHandler } = deps
  const router = Router()

  router.get('/', async (_req, res) => {
    const cfg = await configStore.snapshot()
    const list = registry.list().filter((t: any) => !cfg.terminalOverrides?.[t.terminalId]?.deleted)
    const merged = list.map((t: any) => {
      const ov = cfg.terminalOverrides?.[t.terminalId]
      return {
        ...t,
        title: ov?.titleOverride || t.title,
        description: ov?.descriptionOverride || t.description,
      }
    })
    res.json(merged)
  })

  router.patch('/:terminalId', async (req, res) => {
    const terminalId = req.params.terminalId
    const parsed = TerminalPatchSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
    }
    const { titleOverride: rawTitle, descriptionOverride: rawDesc, deleted } = parsed.data
    const titleOverride = rawTitle !== undefined ? cleanString(rawTitle) : undefined
    const descriptionOverride = rawDesc !== undefined ? cleanString(rawDesc) : undefined

    const next = await configStore.patchTerminalOverride(terminalId, {
      titleOverride,
      descriptionOverride,
      deleted,
    })

    if (typeof titleOverride === 'string' && titleOverride.trim()) registry.updateTitle(terminalId, titleOverride.trim())
    if (typeof descriptionOverride === 'string') registry.updateDescription(terminalId, descriptionOverride)

    wsHandler.broadcast({ type: 'terminal.list.updated' })
    res.json(next)
  })

  router.delete('/:terminalId', async (req, res) => {
    const terminalId = req.params.terminalId
    await configStore.deleteTerminal(terminalId)
    wsHandler.broadcast({ type: 'terminal.list.updated' })
    res.json({ ok: true })
  })

  return router
}
