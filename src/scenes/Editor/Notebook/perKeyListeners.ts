// One listener set per key, with a single subscribe contract across the
// notebook engines: subscribe returns its own unsubscribe closure.
export class PerKeyListeners {
  private listeners = new Map<string, Set<() => void>>()

  subscribe(key: string, listener: () => void): () => void {
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(listener)
    return () => {
      const current = this.listeners.get(key)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.listeners.delete(key)
    }
  }

  notify(key: string) {
    this.listeners.get(key)?.forEach((listener) => listener())
  }

  clear() {
    this.listeners.clear()
  }
}
