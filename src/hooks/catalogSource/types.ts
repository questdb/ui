export type SourceState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unavailable" }

export type SourceFetchOutcome = "success" | "failure" | "skipped"
