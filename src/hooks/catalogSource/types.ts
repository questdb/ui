export type SourceState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unavailable" }
