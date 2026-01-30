import express from 'express'
import fsp from 'fs/promises'
import path from 'path'

export const filesRouter = express.Router()

filesRouter.get('/read', async (req, res) => {
  const filePath = req.query.path as string
  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter required' })
  }

  const resolved = path.resolve(filePath)

  try {
    const stat = await fsp.stat(resolved)
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot read directory' })
    }

    const content = await fsp.readFile(resolved, 'utf-8')
    res.json({
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    })
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' })
    }
    return res.status(500).json({ error: err.message })
  }
})
