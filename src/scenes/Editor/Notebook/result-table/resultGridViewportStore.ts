import type { ResultGridViewport } from "../../../../components/ResultGrid/types"

const MAX_VIEWPORTS_PER_CELL = 20

type ViewportEntry = ResultGridViewport & { runToken: number }

export type ResultGridViewportStore = {
  replaceResult: (runToken: number) => void
  load: (queryKey: string, runToken: number) => ResultGridViewport | null
  save: (
    queryKey: string,
    runToken: number,
    viewport: ResultGridViewport,
  ) => void
  clear: () => void
}

const normalizeOffset = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

export const createResultGridViewportStore = (): ResultGridViewportStore => {
  const entries = new Map<string, ViewportEntry>()
  let currentResultToken: number | undefined

  return {
    replaceResult(runToken) {
      if (currentResultToken !== undefined && currentResultToken !== runToken) {
        entries.clear()
      }
      currentResultToken = runToken
    },

    load(queryKey, runToken) {
      const entry = entries.get(queryKey)
      if (!entry || entry.runToken !== runToken) return null
      return { scrollTop: entry.scrollTop, scrollLeft: entry.scrollLeft }
    },

    save(queryKey, runToken, viewport) {
      if (currentResultToken !== undefined && currentResultToken !== runToken) {
        return
      }
      entries.delete(queryKey)
      entries.set(queryKey, {
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
      currentResultToken = undefined
    },
  }
}
