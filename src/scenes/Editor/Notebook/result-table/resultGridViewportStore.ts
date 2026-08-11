import type { ResultGridViewport } from "../../../../components/ResultGrid/types"

const MAX_VIEWPORTS_PER_CELL = 20

type ViewportEntry = ResultGridViewport & { runToken: number }

// Keyed per STATEMENT (normalized text + occurrence), not per frame: a
// refresh settles one slot at a time, so only the statement that actually got
// new rows loses its saved scroll. The entry's own token carries that — a
// stale token simply fails to load.
export type ResultGridViewportStore = {
  load: (statementKey: string, runToken: number) => ResultGridViewport | null
  save: (
    statementKey: string,
    runToken: number,
    viewport: ResultGridViewport,
  ) => void
  clear: () => void
}

const normalizeOffset = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

export const createResultGridViewportStore = (): ResultGridViewportStore => {
  const entries = new Map<string, ViewportEntry>()

  return {
    load(statementKey, runToken) {
      const entry = entries.get(statementKey)
      if (!entry || entry.runToken !== runToken) return null
      return { scrollTop: entry.scrollTop, scrollLeft: entry.scrollLeft }
    },

    save(statementKey, runToken, viewport) {
      entries.delete(statementKey)
      entries.set(statementKey, {
        runToken,
        scrollTop: normalizeOffset(viewport.scrollTop),
        scrollLeft: normalizeOffset(viewport.scrollLeft),
      })
      while (entries.size > MAX_VIEWPORTS_PER_CELL) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    },

    clear() {
      entries.clear()
    },
  }
}
