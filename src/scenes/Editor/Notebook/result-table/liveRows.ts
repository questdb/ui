import { useMemo, useRef } from "react"
import type { DqlQueryResult, GridMode } from "../../../../store/notebook"
import {
  identityColumnIndexes,
  identityKeyOf,
} from "../../../../components/ResultGrid/highlight/identityIndex"

// Live grid modes, for results that refresh in place.
//
//   stable  Rows keep their place: a row whose identity was shown before
//           stays at its earlier position, new rows go to the end. A
//           watchlist sorted by a moving value then does not jump around.
//   stream  The query decides the order (newest first, typically); rows
//           whose identity was not in the previous result are marked new,
//           so they flash as they arrive. A trade tape or log stream.
//
// Both need identity columns; without them the result shows as returned.

export type LiveRows = {
  data: DqlQueryResult
  // Whether the row at a display index is new since the previous result.
  isNew: ((row: number) => boolean) | null
  // When this result arrived and how many have, so new rows flash from now.
  at: number
  revision: number
}

export const orderStably = (
  dataset: DqlQueryResult["dataset"],
  keys: string[],
  previousRank: Map<string, number>,
): DqlQueryResult["dataset"] => {
  const order = dataset.map((row, i) => ({
    row,
    rank: previousRank.get(keys[i]) ?? Number.MAX_SAFE_INTEGER,
    i,
  }))
  order.sort((a, b) => a.rank - b.rank || a.i - b.i)
  return order.map((o) => o.row)
}

export const useLiveRows = (
  data: DqlQueryResult,
  identityColumns: string[],
  mode: GridMode | undefined,
): LiveRows => {
  const previousKeys = useRef<Map<string, number> | null>(null)
  const last = useRef<{
    data: DqlQueryResult
    mode: GridMode
    identity: string
  } | null>(null)
  const live = useRef<LiveRows>({ data, isNew: null, at: 0, revision: 0 })

  return useMemo(() => {
    const indexes = mode
      ? identityColumnIndexes(data.columns, identityColumns)
      : null
    if (!mode || indexes === null) {
      last.current = null
      previousKeys.current = null
      return { data, isNew: null, at: 0, revision: 0 }
    }
    const identity = JSON.stringify(identityColumns)
    const sameFrame = last.current?.data === data
    const sameIdentity = last.current?.identity === identity
    if (sameFrame && sameIdentity && last.current?.mode === mode)
      return live.current
    const keyOf = (row: DqlQueryResult["dataset"][number]) =>
      identityKeyOf(row, indexes)
    const before = sameIdentity ? previousKeys.current : null
    const dataset =
      mode === "stable" && before
        ? orderStably(data.dataset, data.dataset.map(keyOf), before)
        : data.dataset
    const keys = dataset.map(keyOf)
    const fresh =
      before === null || sameFrame
        ? new Set<number>()
        : new Set(keys.flatMap((key, i) => (before.has(key) ? [] : [i])))
    previousKeys.current = new Map(keys.map((key, i) => [key, i]))
    last.current = { data, mode, identity }
    live.current = {
      data: dataset === data.dataset ? data : { ...data, dataset },
      isNew: fresh.size > 0 ? (row) => fresh.has(row) : null,
      at: Date.now(),
      revision: live.current.revision + 1,
    }
    return live.current
  }, [data, identityColumns, mode])
}
