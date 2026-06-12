import { useCallback, useMemo, useRef, useState } from "react"
import type { QueryRawResult } from "../../utils"
import type { ColumnDefinition } from "../../utils/questdb/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import type {
  ResultGridDataSource,
  ResultGridRow,
} from "../../components/ResultGrid"
import { PAGE_SIZE, nextPageWindow } from "./nextPageWindow"

const LOAD_DEBOUNCE_MS = 75

export type PaginationFn = (
  sql: string,
  lo: number,
  hi: number,
  rendererFn: (data: QueryRawResult) => void,
) => void

type SeedResult = {
  columns: ColumnDefinition[]
  dataset: ResultGridRow[]
  count: number
  query: string
  timestamp?: number
}

type Meta = {
  columns: ColumnDefinition[]
  rowCount: number
  query: string
  sampleRows: ResultGridRow[]
  designatedTimestamp: number
}

const EMPTY_META: Meta = {
  columns: [],
  rowCount: 0,
  query: "",
  sampleRows: [],
  designatedTimestamp: -1,
}

// Server-paged data source: a sparse page cache extended as the window scrolls.
// Errors are owned by `paginationFn` — it surfaces a notification and never
// calls the renderer, so a failed page stays unloaded and renders blank.
export const usePagedDataSource = (paginationFn?: PaginationFn) => {
  const [version, setVersion] = useState(0)
  const [meta, setMeta] = useState<Meta>(EMPTY_META)

  const cacheRef = useRef<Map<number, ResultGridRow[]>>(new Map())
  const loPageRef = useRef(0)
  const hiPageRef = useRef(0)
  const sqlRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultGenerationRef = useRef(0)

  const bumpVersion = useCallback(() => setVersion((v) => v + 1), [])

  const isEmptyPage = useCallback((page: number): boolean => {
    const data = cacheRef.current.get(page)
    return !data || data.length === 0
  }, [])

  const purgeOutlierPages = useCallback(() => {
    const lo = loPageRef.current
    const hi = hiPageRef.current
    for (const page of Array.from(cacheRef.current.keys())) {
      if (page < lo || page > hi) {
        cacheRef.current.delete(page)
      }
    }
  }, [])

  const loadPages = useCallback((p1: number, p2: number) => {
    purgeOutlierPages()
    const generation = resultGenerationRef.current

    let lo: number
    let hi: number
    let renderFunc: (response: QueryRawResult) => void

    if (p1 !== p2 && isEmptyPage(p1) && isEmptyPage(p2)) {
      lo = p1 * PAGE_SIZE
      hi = lo + PAGE_SIZE * (p2 - p1 + 1)
      renderFunc = (response) => {
        if (generation !== resultGenerationRef.current) return
        if (!("dataset" in response)) return
        const dataset: ResultGridRow[] = response.dataset
        cacheRef.current.set(p1, dataset.splice(0, PAGE_SIZE))
        cacheRef.current.set(p2, dataset)
        bumpVersion()
      }
    } else if (isEmptyPage(p1) && (!isEmptyPage(p2) || p1 === p2)) {
      lo = p1 * PAGE_SIZE
      hi = lo + PAGE_SIZE
      renderFunc = (response) => {
        if (generation !== resultGenerationRef.current) return
        if (!("dataset" in response)) return
        cacheRef.current.set(p1, response.dataset)
        bumpVersion()
      }
    } else if ((!isEmptyPage(p1) || p1 === p2) && isEmptyPage(p2)) {
      lo = p2 * PAGE_SIZE
      hi = lo + PAGE_SIZE
      renderFunc = (response) => {
        if (generation !== resultGenerationRef.current) return
        if (!("dataset" in response)) return
        cacheRef.current.set(p2, response.dataset)
        bumpVersion()
      }
    } else {
      bumpVersion()
      return
    }

    if (paginationFn) {
      // QuestDB's limit is 1-based inclusive, so the start row is lo + 1.
      paginationFn(sqlRef.current, lo + 1, hi, renderFunc)
      void trackEvent(ConsoleEvent.GRID_SCROLL, { offset: hi })
    }
  }, [])

  const loadPagesDelayed = useCallback((p1: number, p2: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => loadPages(p1, p2), LOAD_DEBOUNCE_MS)
  }, [])

  const computeDataPages = useCallback(
    (direction: number, t: number, b: number) => {
      const decision = nextPageWindow(direction, t, b, {
        loPage: loPageRef.current,
        hiPage: hiPageRef.current,
      })
      loPageRef.current = decision.loPage
      hiPageRef.current = decision.hiPage
      if (decision.load) {
        loadPagesDelayed(decision.load[0], decision.load[1])
      }
    },
    [],
  )

  const setResult = useCallback((result: SeedResult) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    cacheRef.current = new Map()
    cacheRef.current.set(0, result.dataset)
    loPageRef.current = 0
    hiPageRef.current = 0
    sqlRef.current = result.query
    resultGenerationRef.current += 1
    setMeta({
      columns: result.columns,
      rowCount: result.count,
      query: result.query,
      sampleRows: result.dataset,
      designatedTimestamp: result.timestamp ?? -1,
    })
    bumpVersion()
  }, [])

  const getRow = useCallback(
    (index: number): ResultGridRow | undefined => {
      const page = cacheRef.current.get(Math.floor(index / PAGE_SIZE))
      return page ? page[index % PAGE_SIZE] : undefined
    },
    // version dep is intentional: a fresh getRow identity re-renders new pages.
    [version],
  )

  const onVisibleRowsChange = useCallback(
    ({
      firstIndex,
      lastIndex,
      direction,
    }: {
      firstIndex: number
      lastIndex: number
      direction: number
    }) => {
      computeDataPages(direction, firstIndex, lastIndex)
    },
    [],
  )

  const dataSource = useMemo<ResultGridDataSource>(
    () => ({
      columns: meta.columns,
      rowCount: meta.rowCount,
      designatedTimestamp: meta.designatedTimestamp,
      sampleRows: meta.sampleRows,
      getRow,
      onVisibleRowsChange,
    }),
    [meta, getRow],
  )

  const getSQL = useCallback(() => sqlRef.current, [])

  const getLoadedRows = useCallback((): ResultGridRow[] => {
    const pages = Array.from(cacheRef.current.keys()).sort((a, b) => a - b)
    const rows: ResultGridRow[] = []
    for (const page of pages) {
      const data = cacheRef.current.get(page)
      if (data) rows.push(...data)
    }
    return rows
  }, [])

  return {
    dataSource,
    setResult,
    getSQL,
    getLoadedRows,
    hasData: meta.columns.length > 0,
  }
}
