// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import { createFilesRouter } from '../../../server/files-router'

describe('Candidate directories API integration', () => {
  let app: Express

  beforeEach(() => {
    app = express()
    app.use(express.json())
    app.use('/api/files', createFilesRouter({
      configStore: {
        getSettings: vi.fn().mockResolvedValue({}),
        snapshot: vi.fn().mockResolvedValue({
          settings: { codingCli: { providers: {} } },
          recentDirectories: ['/recent/one', '/terminals/current'],
        }),
      },
      codingCliIndexer: {
        getProjects: () => [
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
      },
      registry: {
        list: () => [
          { cwd: '/terminals/current' },
          { cwd: '/code/project-beta' },
        ],
      },
    }))
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
      ],
    })
  })
})
