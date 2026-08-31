import type {
  LiveView,
  MaterializedView,
  View,
} from "../../../utils/questdb/types"

// The drawer target's kind together with the data that kind can carry. The
// payloads stay nullable because they load after the drawer opens.
export type TableKindData =
  | { kind: "table" }
  | { kind: "view"; view: View | null }
  | { kind: "matview"; matView: MaterializedView | null }
  | { kind: "liveview"; liveView: LiveView | null }
