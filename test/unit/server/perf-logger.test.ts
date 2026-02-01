import { describe, it, expect } from 'vitest'
import { resolvePerfConfig } from '../../../server/perf-logger'

describe('perf logger config', () => {
  it('defaults to disabled with standard thresholds', () => {
    const cfg = resolvePerfConfig({} as NodeJS.ProcessEnv)
    expect(cfg.enabled).toBe(false)
    expect(cfg.httpSlowMs).toBe(500)
    expect(cfg.wsSlowMs).toBe(50)
  })

  it('enables with PERF_LOGGING or PERF_DEBUG', () => {
    const enabled = resolvePerfConfig({ PERF_LOGGING: '1' } as NodeJS.ProcessEnv)
    expect(enabled.enabled).toBe(true)

    const enabledAlt = resolvePerfConfig({ PERF_DEBUG: 'true' } as NodeJS.ProcessEnv)
    expect(enabledAlt.enabled).toBe(true)
  })

  it('accepts numeric overrides with fallbacks', () => {
    const cfg = resolvePerfConfig({
      PERF_HTTP_SLOW_MS: '250',
      PERF_WS_SLOW_MS: '75',
      PERF_TERMINAL_SAMPLE_MS: '2000',
    } as NodeJS.ProcessEnv)
    expect(cfg.httpSlowMs).toBe(250)
    expect(cfg.wsSlowMs).toBe(75)
    expect(cfg.terminalSampleMs).toBe(2000)

    const fallback = resolvePerfConfig({ PERF_HTTP_SLOW_MS: 'nope' } as NodeJS.ProcessEnv)
    expect(fallback.httpSlowMs).toBe(500)
  })
})
