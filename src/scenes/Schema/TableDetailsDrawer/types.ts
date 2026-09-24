import type {
  LiveView,
  MaterializedView,
  View,
} from "../../../utils/questdb/types"
import type { SourceState } from "../../../hooks/catalogSource"

export type TableKindData =
  | { kind: "table" }
  | { kind: "view"; view: SourceState<View> }
  | { kind: "matview"; matView: SourceState<MaterializedView> }
  | { kind: "liveview"; liveView: SourceState<LiveView> }

export type BaseTableStatus = "Valid" | "Suspended" | "Dropped" | null
