import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import type { ResultGridDataSource } from "../../components/ResultGrid"
import {
  createPagedSource,
  EMPTY_META,
  type PaginationFn,
  type PagedMeta,
  type PagedSource,
  type SeedResult,
  type VisibleRange,
} from "./pagedSource"

export type { PaginationFn } from "./pagedSource"

// Server-paged data source: a sparse page cache extended as the window scrolls.
// Errors are owned by `paginationFn` — it surfaces a notification and never
// calls the renderer, so a failed page stays unloaded and renders blank.
// The scroll/fetch orchestration lives in the framework-free `createPagedSource`
// (unit-tested in pagedSource.test.ts); this hook only bridges it to React.
export const usePagedDataSource = (paginationFn?: PaginationFn) => {
  const [version, setVersion] = useState(0)
  const [meta, setMeta] = useState<PagedMeta>(EMPTY_META)

  const sourceRef = useRef<PagedSource | null>(null)
  if (sourceRef.current === null) {
    sourceRef.current = createPagedSource(
      paginationFn,
      () => {
        setVersion((v) => v + 1)
        setMeta(sourceRef.current!.getMeta())
      },
      (offset) => void trackEvent(ConsoleEvent.GRID_SCROLL, { offset }),
    )
  }
  const source = sourceRef.current

  const setResult = useCallback(
    (result: SeedResult) => source.setResult(result),
    [source],
  )

  const onVisibleRowsChange = useCallback(
    (range: VisibleRange) => source.onVisibleRowsChange(range),
    [source],
  )

  const getRow = useCallback(
    (index: number) => source.getRow(index),
    // version dep is intentional: a fresh getRow identity re-renders new pages.
    [version, source],
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
    [meta, getRow, onVisibleRowsChange],
  )

  const getSQL = useCallback(() => source.getSQL(), [source])

  const getCurrentPageRows = useCallback(
    () => source.getCurrentPageRows(),
    [source],
  )

  useEffect(() => () => source.dispose(), [source])

  return {
    dataSource,
    setResult,
    getSQL,
    getCurrentPageRows,
    hasData: meta.columns.length > 0,
  }
}
