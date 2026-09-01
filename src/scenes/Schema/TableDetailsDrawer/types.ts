import type {
  LiveView,
  MaterializedView,
  View,
} from "../../../utils/questdb/types"

export type SourceState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unavailable" }

export type TableKindData =
  | { kind: "table" }
  | { kind: "view"; view: SourceState<View> }
  | { kind: "matview"; matView: SourceState<MaterializedView> }
  | { kind: "liveview"; liveView: SourceState<LiveView> }
