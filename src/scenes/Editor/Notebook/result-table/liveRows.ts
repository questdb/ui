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

export type LiveRowsState = {
  previousKeys: Map<string, number> | null
  last: { data: DqlQueryResult; mode: GridMode; identity: string } | null
  live: LiveRows | null
}

export const createLiveRowsState = (): LiveRowsState => ({
  previousKeys: null,
  last: null,
  live: null,
})

export const useLiveRows = (
  data: DqlQueryResult,
  identityColumns: string[],
  mode: GridMode | undefined,
  saved?: LiveRowsState,
): LiveRows => {
  const local = useRef(createLiveRowsState())
  const state = saved ?? local.current

  return useMemo(() => {
    const indexes = mode
      ? identityColumnIndexes(data.columns, identityColumns)
      : null
    if (!mode || indexes === null) {
      state.last = null
      state.previousKeys = null
      state.live = null
      return { data, isNew: null, at: 0, revision: 0 }
    }
    const identity = JSON.stringify(identityColumns)
    const sameFrame = state.last?.data === data
    const sameIdentity = state.last?.identity === identity
    if (sameFrame && sameIdentity && state.last?.mode === mode && state.live)
      return state.live
    const keyOf = (row: DqlQueryResult["dataset"][number]) =>
      identityKeyOf(row, indexes)
    const before = sameIdentity ? state.previousKeys : null
    const dataset =
      mode === "stable" && before
        ? orderStably(data.dataset, data.dataset.map(keyOf), before)
        : data.dataset
    const keys = dataset.map(keyOf)
    const fresh =
      before === null || sameFrame
        ? new Set<number>()
        : new Set(keys.flatMap((key, i) => (before.has(key) ? [] : [i])))
    state.previousKeys = new Map(keys.map((key, i) => [key, i]))
    state.last = { data, mode, identity }
    state.live = {
      data: dataset === data.dataset ? data : { ...data, dataset },
      isNew: fresh.size > 0 ? (row) => fresh.has(row) : null,
      at: Date.now(),
      revision: (state.live?.revision ?? 0) + 1,
    }
    return state.live
  }, [data, identityColumns, mode, state])
}
