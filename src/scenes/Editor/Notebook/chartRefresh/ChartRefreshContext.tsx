import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { NotebookCell } from "../../../../store/notebook"
import {
  ChartRefreshEngine,
  type ChartFetchState,
  type ChartRefreshDeps,
} from "./chartRefreshEngine"

const ChartRefreshContext = createContext<ChartRefreshEngine | null>(null)

export const ChartRefreshProvider = ChartRefreshContext.Provider

export const useChartRefresh = () => useContext(ChartRefreshContext)

export const useChartRefreshEngine = (options: {
  bufferId: number
  cells: NotebookCell[]
  deps: ChartRefreshDeps
}): ChartRefreshEngine => {
  const { bufferId, cells, deps } = options
  const depsRef = useRef(deps)
  const engine = useMemo(
    () => new ChartRefreshEngine(bufferId, () => depsRef.current),
    [bufferId],
  )

  useEffect(() => {
    depsRef.current = deps
  })

  useEffect(() => {
    engine.attach()
    return () => engine.destroy()
  }, [engine])

  useEffect(() => {
    engine.sync(cells)
  }, [engine, cells])

  return engine
}

export const useChartFetchState = (
  cellId: string,
): ChartFetchState | undefined => {
  const engine = useContext(ChartRefreshContext)
  const [state, setState] = useState<ChartFetchState | undefined>(() =>
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
