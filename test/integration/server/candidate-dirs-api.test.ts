import { describe, it, expect, beforeEach } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import { collectCandidateDirectories } from '../../../server/candidate-dirs'

describe('Candidate directories API integration', () => {
  let app: Express

  beforeEach(() => {
    app = express()
    app.get('/api/files/candidate-dirs', (_req, res) => {
      const directories = collectCandidateDirectories({
        projects: [
          {
            projectPath: '/code/project-alpha',
            sessions: [
              { cwd: '/code/project-alpha' },
              { cwd: '/code/project-beta' },
            ],
          },
          {
            projectPath: '/code/project-gamma',
            sessions: [{ cwd: '/code/project-gamma/worktree' }],
          },
        ],
        terminals: [
          { cwd: '/terminals/current' },
          { cwd: '/code/project-beta' },
        ],
        recentDirectories: ['/recent/one', '/terminals/current'],
        providerCwds: ['/providers/claude', ''],
        defaultCwd: '/defaults/base',
      })

      res.json({ directories })
    })
  })

  it('aggregates candidate directories from all configured sources and deduplicates', async () => {
    const res = await request(app).get('/api/files/candidate-dirs')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      directories: [
        '/code/project-alpha',
        '/code/project-beta',
        '/code/project-gamma',
        '/code/project-gamma/worktree',
        '/terminals/current',
        '/recent/one',
        '/providers/claude',
        '/defaults/base',
      ],
    })
  })
})
