import { describe, it, expect } from 'vitest'
import { getFirstTerminalCwd, collectTerminalIds, findPaneContent } from '../../../src/lib/pane-utils'
import type { PaneNode } from '../../../src/store/paneTypes'

describe('getFirstTerminalCwd', () => {
  it('returns null for editor-only layout', () => {
    const layout: PaneNode = {
      type: 'leaf',
      id: 'p1',
      content: {
        kind: 'editor',
        filePath: null,
        language: null,
        readOnly: false,
        content: '',
        viewMode: 'source',
      },
    }
    expect(getFirstTerminalCwd(layout, {})).toBeNull()
  })

  it('returns cwd from single terminal pane', () => {
    const layout: PaneNode = {
      type: 'leaf',
      id: 'p1',
      content: {
        kind: 'terminal',
        terminalId: 't1',
        createRequestId: 'r1',
        status: 'running',
        mode: 'shell',
      },
    }
    const cwdMap = { t1: '/home/user/project' }
    expect(getFirstTerminalCwd(layout, cwdMap)).toBe('/home/user/project')
  })

  it('returns first terminal cwd in split (depth-first)', () => {
    const layout: PaneNode = {
      type: 'split',
      id: 's1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        {
          type: 'leaf',
          id: 'p1',
          content: {
            kind: 'editor',
            filePath: null,
            language: null,
            readOnly: false,
            content: '',
            viewMode: 'source',
          },
        },
        {
          type: 'leaf',
          id: 'p2',
          content: {
            kind: 'terminal',
            terminalId: 't1',
            createRequestId: 'r1',
            status: 'running',
            mode: 'shell',
          },
        },
      ],
    }
    const cwdMap = { t1: '/home/user/project' }
    expect(getFirstTerminalCwd(layout, cwdMap)).toBe('/home/user/project')
  })

  it('collects terminal ids in depth-first order', () => {
    const layout: PaneNode = {
      type: 'split',
      id: 's1',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        {
          type: 'leaf',
          id: 'p1',
          content: {
            kind: 'terminal',
            terminalId: 't1',
            createRequestId: 'r1',
            status: 'running',
            mode: 'shell',
          },
        },
        {
          type: 'split',
          id: 's2',
          direction: 'horizontal',
          sizes: [50, 50],
          children: [
            {
              type: 'leaf',
              id: 'p2',
              content: {
                kind: 'editor',
                filePath: null,
                language: null,
                readOnly: false,
                content: '',
                viewMode: 'source',
              },
            },
            {
              type: 'leaf',
              id: 'p3',
              content: {
                kind: 'terminal',
                terminalId: 't2',
                createRequestId: 'r2',
                status: 'running',
                mode: 'shell',
              },
            },
          ],
        },
      ],
    }

    expect(collectTerminalIds(layout)).toEqual(['t1', 't2'])
  })

  it('finds pane content by id', () => {
    const layout: PaneNode = {
      type: 'split',
      id: 's1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        {
          type: 'leaf',
          id: 'pane-left',
          content: {
            kind: 'terminal',
            terminalId: 't1',
            createRequestId: 'r1',
            status: 'running',
            mode: 'shell',
          },
        },
        {
          type: 'leaf',
          id: 'pane-right',
          content: {
            kind: 'editor',
            filePath: null,
            language: null,
            readOnly: false,
            content: '',
            viewMode: 'source',
          },
        },
      ],
    }

    const found = findPaneContent(layout, 'pane-right')
    expect(found && found.kind).toBe('editor')
    expect(findPaneContent(layout, 'missing')).toBeNull()
  })
})
