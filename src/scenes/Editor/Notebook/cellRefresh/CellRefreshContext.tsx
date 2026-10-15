import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
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

  // Abort rounds during the unmount commit, before session-ended query
  // continuations can replace or delete the last saved frame.
  useLayoutEffect(() => {
    engine.attach()
    return () => engine.detach()
  }, [engine])

  // Flushing pending frames can serialize large datasets. Keep it outside
  // the layout cleanup so switching buffers can paint first.
  useEffect(() => () => engine.destroy(), [engine])

  useEffect(() => {
    engine.sync(cells, autoRefreshDefault)
  }, [engine, cells, autoRefreshDefault])

  return engine
}

export const shallowEqual = <T extends Record<string, unknown>>(
  a: T | undefined,
  b: T | undefined,
): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.is(a[key], b[key]))
  )
}

export const selectFetching = (state: CellFetchState | undefined): boolean =>
  state?.fetching ?? false

export const selectWriteBlocked = (
  state: CellFetchState | undefined,
): boolean => state?.classifyBlock?.kind === "write"

// A cell re-renders only when the part of the fetch state it selects changes.
// `select` and `isEqual` must be stable (module-level), or every render
// resubscribes.
export const useCellFetchSelector = <T,>(
  cellId: string,
  select: (state: CellFetchState | undefined) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T => {
  const engine = useContext(CellRefreshContext)
  const [selected, setSelected] = useState<T>(() =>
    select(engine?.getState(cellId)),
  )

  useEffect(() => {
    const apply = () => {
      const next = select(engine?.getState(cellId))
      setSelected((prev) => (isEqual(prev, next) ? prev : next))
    }

    // Catch up on anything published between render and subscription.
    apply()

    return engine?.subscribe(cellId, apply)
  }, [engine, cellId, select, isEqual])

  return selected
}
