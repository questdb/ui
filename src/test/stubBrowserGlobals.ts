import "fake-indexeddb/auto"

// Stubs the browser globals the db.ts singleton touches at import time, so
// store-backed vitest suites can construct it. Import this FIRST — before any
// module that (transitively) imports the store.
const storage: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => {
    storage[k] = v
  },
  removeItem: (k: string) => {
    delete storage[k]
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k])
  },
  get length() {
    return Object.keys(storage).length
  },
  key: () => null,
} as Storage
globalThis.window = globalThis as unknown as Window & typeof globalThis
;(globalThis as Record<string, unknown>).location = {
  href: "http://localhost/",
}
;(globalThis as Record<string, unknown>).history = {
  replaceState: () => {},
}
