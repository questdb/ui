export type RunStatus = "success" | "error" | "none" | "running" | "cancelled"

export type RanStatus = Exclude<RunStatus, "none" | "running">

export const deriveRunStatusFromResults = (
  results: ReadonlyArray<{ type: string; error?: string }> | null | undefined,
): { status: RunStatus; error?: string } => {
  if (!results || results.length === 0) return { status: "none" }
  let running = false
  let hasError = false
  let firstError: string | undefined
  let cancelled = false
  let committed = false
  for (const r of results) {
    if (r.type === "running" || r.type === "queued") {
      running = true
    } else if (r.type === "error") {
      if (!hasError) firstError = r.error
      hasError = true
    } else if (r.type === "cancelled") {
      cancelled = true
    } else if (r.type === "dql" || r.type === "ddl" || r.type === "dml") {
      committed = true
    }
  }
  if (running) return { status: "running" }
  if (hasError) return { status: "error", error: firstError }
  if (cancelled) return { status: "cancelled" }
  if (committed) return { status: "success" }
  return { status: "none" }
}

export const getCellRunStatus = (
  cell:
    | {
        result?: {
          results: ReadonlyArray<{ type: string; error?: string }>
        } | null
        lastRunStatus?: RunStatus
        lastRunError?: string
      }
    | null
    | undefined,
): { status: RunStatus; error?: string } => {
  if (cell?.result) return deriveRunStatusFromResults(cell.result.results)
  return {
    status: cell?.lastRunStatus ?? "none",
    ...(cell?.lastRunError ? { error: cell.lastRunError } : {}),
  }
}

export const createRunStatus = (
  priorResult: { results: ReadonlyArray<{ type: string }> } | null | undefined,
  freshResult: { results: ReadonlyArray<{ type: string }> } | null | undefined,
  ok: boolean,
): RanStatus => {
  if (freshResult && freshResult !== priorResult) {
    const { status } = deriveRunStatusFromResults(freshResult.results)
    if (status === "success" || status === "error" || status === "cancelled") {
      return status
    }
  }
  return ok ? "success" : "error"
}
