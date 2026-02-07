import { nanoid } from 'nanoid'

export const PERSIST_BROADCAST_CHANNEL_NAME = 'freshell.persist.v1'

let sourceId: string | null = null
export function getPersistBroadcastSourceId(): string {
  if (sourceId) return sourceId
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    sourceId = crypto.randomUUID()
  } else {
    sourceId = nanoid()
  }
  return sourceId
}

export type PersistBroadcastMessage = {
  type: 'persist'
  key: string
  raw: string
  sourceId: string
}

export function broadcastPersistedRaw(key: string, raw: string): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const ch = new BroadcastChannel(PERSIST_BROADCAST_CHANNEL_NAME)
    const msg: PersistBroadcastMessage = {
      type: 'persist',
      key,
      raw,
      sourceId: getPersistBroadcastSourceId(),
    }
    ch.postMessage(msg)
    ch.close()
  } catch {
    // ignore
  }
}
