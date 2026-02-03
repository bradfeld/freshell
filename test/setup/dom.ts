import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

const clipboardMock = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
}

Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: clipboardMock,
  configurable: true,
})

class LocalStorageMock {
  #store = new Map<string, string>()

  get length() {
    return this.#store.size
  }

  key(index: number) {
    return Array.from(this.#store.keys())[index] ?? null
  }

  getItem(key: string) {
    return this.#store.has(key) ? this.#store.get(key)! : null
  }

  setItem(key: string, value: string) {
    const stringValue = String(value)
    this.#store.set(key, stringValue)
    Object.defineProperty(this, key, {
      value: stringValue,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  }

  removeItem(key: string) {
    this.#store.delete(key)
    delete (this as Record<string, string>)[key]
  }

  clear() {
    for (const key of this.#store.keys()) {
      delete (this as Record<string, string>)[key]
    }
    this.#store.clear()
  }
}

const hasStorage =
  typeof globalThis.localStorage !== 'undefined' &&
  typeof globalThis.localStorage.getItem === 'function' &&
  typeof globalThis.localStorage.setItem === 'function' &&
  typeof globalThis.localStorage.clear === 'function'

if (!hasStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new LocalStorageMock(),
    configurable: true,
    writable: true,
  })
}
