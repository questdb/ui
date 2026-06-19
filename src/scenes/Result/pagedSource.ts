import type { QueryRawResult } from "../../utils"
import type { ColumnDefinition } from "../../utils/questdb/types"
import type { ResultGridRow } from "../../components/ResultGrid"
import { PAGE_SIZE, nextPageWindow } from "./nextPageWindow"
import { planPageFetch, fetchRangeForPlan } from "./pageFetchPlan"
import {
  applyPageResponse,
  getRowFromCache,
  isPageEmpty,
  purgeOutlierPages,
  type PageCache,
} from "./pageCache"

export const LOAD_DEBOUNCE_MS = 75

export type PaginationFn = (
  sql: string,
  lo: number,
  hi: number,
  rendererFn: (data: QueryRawResult) => void,
) => void

export type SeedResult = {
  columns: ColumnDefinition[]
  dataset: ResultGridRow[]
  count: number
  query: string
  timestamp?: number
}

export type PagedMeta = {
  columns: ColumnDefinition[]
  rowCount: number
  query: string
  sampleRows: ResultGridRow[]
  designatedTimestamp: number
}

export const EMPTY_META: PagedMeta = {
  columns: [],
  rowCount: 0,
  query: "",
  sampleRows: [],
  designatedTimestamp: -1,
}

export type VisibleRange = {
  firstIndex: number
  lastIndex: number
  direction: number
}

export type PagedSource = {
  setResult: (result: SeedResult) => void
  onVisibleRowsChange: (range: VisibleRange) => void
  getRow: (index: number) => ResultGridRow | undefined
  getSQL: () => string
  getCurrentPageRows: () => ResultGridRow[]
  getMeta: () => PagedMeta
  dispose: () => void
}

export const createPagedSource = (
  paginationFn: PaginationFn | undefined,
  onChange: () => void,
  onScroll?: (offset: number) => void,
): PagedSource => {
  let cache: PageCache = new Map()
  let loPage = 0
  let hiPage = 0
  let currentPage = 0
  let sql = ""
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let meta: PagedMeta = EMPTY_META

  const loadPages = (p1: number, p2: number) => {
    purgeOutlierPages(cache, loPage, hiPage)
    const requestedGeneration = generation
    const plan = planPageFetch(p1, p2, (page) => isPageEmpty(cache, page))
    const range = fetchRangeForPlan(plan)

    if (!range) return

    const onPageResponse = (response: QueryRawResult) => {
      const applied = applyPageResponse(
        cache,
        plan,
        response,
        requestedGeneration,
        generation,
      )
      if (applied) onChange()
    }

    if (paginationFn) {
      paginationFn(sql, range.lo, range.hi, onPageResponse)
      onScroll?.(range.hi)
    }
  }

  const loadPagesDelayed = (p1: number, p2: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      loadPages(p1, p2)
    }, LOAD_DEBOUNCE_MS)
  }

  const setResult = (result: SeedResult) => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    cache = new Map()
    cache.set(0, result.dataset)
    loPage = 0
    hiPage = 0
    currentPage = 0
    sql = result.query
    generation += 1
    meta = {
      columns: result.columns,
      rowCount: result.count,
      query: result.query,
      sampleRows: result.dataset,
      designatedTimestamp: result.timestamp ?? -1,
    }
    onChange()
  }

  const onVisibleRowsChange = ({
    firstIndex,
    lastIndex,
    direction,
  }: VisibleRange) => {
    currentPage = Math.floor(firstIndex / PAGE_SIZE)
    const decision = nextPageWindow(direction, firstIndex, lastIndex, {
      loPage,
      hiPage,
    })
    loPage = decision.loPage
    hiPage = decision.hiPage
    if (decision.load) {
      loadPagesDelayed(decision.load[0], decision.load[1])
    }
  }

  return {
    setResult,
    onVisibleRowsChange,
    getRow: (index) => getRowFromCache(cache, index),
    getSQL: () => sql,
    getCurrentPageRows: () => cache.get(currentPage) ?? [],
    getMeta: () => meta,
    dispose: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
