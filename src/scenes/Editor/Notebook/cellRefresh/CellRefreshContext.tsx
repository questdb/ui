import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { unstable_batchedUpdates } from "react-dom"
import type { AutoRefresh, NotebookCell } from "../../../../store/notebook"
import {
  CellRefreshEngine,
  type CellFetchState,
  type CellRefreshDeps,
} from "./cellRefreshEngine"

const CellRefreshContext = createContext<CellRefreshEngine | null>(null)

export const CellRefreshProvider = CellRefreshContext.Provider

export const useCellRefresh = () => useContext(CellRefreshContext)

export const useCellRefreshEngine = (options: {
  bufferId: number
  cells: NotebookCell[]
  autoRefreshDefault?: AutoRefresh
  deps: CellRefreshDeps
}): CellRefreshEngine => {
  const { bufferId, cells, autoRefreshDefault, deps } = options
  const depsRef = useRef(deps)
  const engine = useMemo(
    () =>
      new CellRefreshEngine(bufferId, () => depsRef.current, {
        batchUpdates: unstable_batchedUpdates,
      }),
    [bufferId],
  )

  useEffect(() => {
    depsRef.current = deps
  }, [deps])

  useEffect(() => {
    engine.attach()
    return () => engine.destroy()
  }, [engine])

  useEffect(() => {
    engine.sync(cells, autoRefreshDefault)
  }, [engine, cells, autoRefreshDefault])

  return engine
}

export const useCellFetchState = (
  cellId: string,
): CellFetchState | undefined => {
  const engine = useContext(CellRefreshContext)
  const [state, setState] = useState<CellFetchState | undefined>(() =>
    engine?.getState(cellId),
  )

  useEffect(() => {
    if (!engine) return
    const listener = () => setState(engine.getState(cellId))

    // Catch up on anything published between render and subscription.
    setState(engine.getState(cellId))

    return engine.subscribe(cellId, listener)
  }, [engine, cellId])

  return state
}
