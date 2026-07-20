import { createContext, useContext, useEffect, useState } from "react"
import {
  CellResultHydrationEngine,
  type CellResultStatus,
} from "./cellResultHydration"

const CellResultHydrationContext =
  createContext<CellResultHydrationEngine | null>(null)

export const CellResultHydrationProvider = CellResultHydrationContext.Provider

export const useCellResultHydrationEngine = () =>
  useContext(CellResultHydrationContext)

export const useCellResultStatus = (cellId: string): CellResultStatus => {
  const engine = useContext(CellResultHydrationContext)
  const [status, setStatus] = useState<CellResultStatus>(() =>
    engine ? engine.statusOf(cellId) : "unrequested",
  )

  useEffect(() => {
    if (!engine) return
    setStatus(engine.statusOf(cellId))
    return engine.subscribe(cellId, () => setStatus(engine.statusOf(cellId)))
  }, [engine, cellId])

  return engine ? status : "unrequested"
}

// Version counter for consumers that derive from many cells' statuses at once
// (the grid layout memo) — cheaper than subscribing per cell. Bumps only when
// a cell's known-missing state flips (the sole status boundary isExpectingResult
// reads), so scroll-driven loading/loaded churn doesn't invalidate the memo.
export const useResultStatusVersion = (): number => {
  const engine = useContext(CellResultHydrationContext)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!engine) return
    return engine.subscribeAny(() => setVersion((v) => v + 1))
  }, [engine])

  return version
}
