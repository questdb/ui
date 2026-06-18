import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { QueryRawResult } from "../../utils"
import type { ColumnDefinition } from "../../utils/questdb/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import type {
  ResultGridDataSource,
  ResultGridRow,
} from "../../components/ResultGrid"
import { PAGE_SIZE, nextPageWindow } from "./nextPageWindow"
import { planPageFetch } from "./pageFetchPlan"
import {
  applyPageResponse,
  getRowFromCache,
  isPageEmpty,
  purgeOutlierPages as purgeOutlierPagesFromCache,
} from "./pageCache"

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
  const currentPageRef = useRef(0)
  const sqlRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultGenerationRef = useRef(0)

  const bumpVersion = useCallback(() => setVersion((v) => v + 1), [])

  const isEmptyPage = useCallback(
    (page: number): boolean => isPageEmpty(cacheRef.current, page),
    [],
  )

  const purgeOutlierPages = useCallback(() => {
    purgeOutlierPagesFromCache(
      cacheRef.current,
      loPageRef.current,
      hiPageRef.current,
    )
  }, [])

  const loadPages = useCallback((p1: number, p2: number) => {
    purgeOutlierPages()
    const requestedGeneration = resultGenerationRef.current
    const plan = planPageFetch(p1, p2, isEmptyPage)

    if (plan.kind === "none") return

    const onPageResponse = (response: QueryRawResult) => {
      const applied = applyPageResponse(
        cacheRef.current,
        plan,
        response,
        requestedGeneration,
        resultGenerationRef.current,
      )
      if (applied) bumpVersion()
    }

    if (paginationFn) {
      // QuestDB's limit is 1-based inclusive, so the start row is lo + 1.
      paginationFn(sqlRef.current, plan.lo + 1, plan.hi, onPageResponse)
      void trackEvent(ConsoleEvent.GRID_SCROLL, { offset: plan.hi })
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
    currentPageRef.current = 0
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
    (index: number): ResultGridRow | undefined =>
      getRowFromCache(cacheRef.current, index),
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
      currentPageRef.current = Math.floor(firstIndex / PAGE_SIZE)
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

  const getCurrentPageRows = useCallback(
    (): ResultGridRow[] => cacheRef.current.get(currentPageRef.current) ?? [],
    [],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return {
    dataSource,
    setResult,
    getSQL,
    getCurrentPageRows,
    hasData: meta.columns.length > 0,
  }
}
