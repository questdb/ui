// A drawer session lives outside React so it survives the cell remount that
// maximize and restore cause. One entry per key while the drawer is open; the
// entry carries the draft so unsaved edits come back after the remount.
export type SettingsDrawerSessionStore<Session> = {
  get: (key: string) => Session | undefined
  set: (key: string, session: Session) => void
  update: (key: string, patch: Partial<Session>) => void
  clear: (key: string) => void
  clearWhere: (predicate: (key: string) => boolean) => void
}

export const createSettingsDrawerSessionStore = <
  Session extends object,
>(): SettingsDrawerSessionStore<Session> => {
  const sessions = new Map<string, Session>()
  return {
    get: (key) => sessions.get(key),
    set: (key, session) => {
      sessions.set(key, session)
    },
    update: (key, patch) => {
      const current = sessions.get(key)
      if (current) sessions.set(key, { ...current, ...patch })
    },
    clear: (key) => {
      sessions.delete(key)
    },
    clearWhere: (predicate) => {
      for (const key of [...sessions.keys()]) {
        if (predicate(key)) sessions.delete(key)
      }
    },
  }
}
