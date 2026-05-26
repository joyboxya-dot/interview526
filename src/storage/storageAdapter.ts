export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function createBrowserStorageAdapter(): StorageAdapter | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.localStorage
}

export function createMemoryStorageAdapter(): StorageAdapter {
  const map = new Map<string, string>()

  return {
    getItem(key) {
      return map.get(key) ?? null
    },
    setItem(key, value) {
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}
