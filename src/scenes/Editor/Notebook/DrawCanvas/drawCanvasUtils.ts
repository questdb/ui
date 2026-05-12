import type { QueryExecResult } from "../../../../hooks/useQueryExecution"

// Keep only DQL results that actually returned rows. The chart can't render
// empty datasets, and non-DQL results (error/ddl/dml) have no columns.
export const successResults = (
  results: (QueryExecResult | null)[],
): QueryExecResult[] =>
  results.filter(
    (r): r is QueryExecResult =>
      r !== null && r.type === "dql" && r.dataset.length > 0,
  )

// Shape/value equality: same column names, same dataset length, same first
// and last row by identity. Skipping a re-render when the shape matches
// avoids resetting echarts tooltip/zoom state on every unchanged poll tick.
export const resultsEquivalent = (
  a: QueryExecResult[],
  b: QueryExecResult[],
): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.columns.length !== y.columns.length) return false
    for (let c = 0; c < x.columns.length; c++) {
      if (x.columns[c].name !== y.columns[c].name) return false
    }
    if (x.dataset.length !== y.dataset.length) return false
    if (x.dataset.length === 0) continue
    const firstA = x.dataset[0]
    const firstB = y.dataset[0]
    if (firstA.length !== firstB.length) return false
    for (let c = 0; c < firstA.length; c++) {
      if (firstA[c] !== firstB[c]) return false
    }
    const lastA = x.dataset[x.dataset.length - 1]
    const lastB = y.dataset[y.dataset.length - 1]
    for (let c = 0; c < lastA.length; c++) {
      if (lastA[c] !== lastB[c]) return false
    }
  }
  return true
}
