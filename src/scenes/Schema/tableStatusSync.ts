import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import {
  type LiveView,
  type MaterializedView,
  type Table,
  type TableKind,
  type View,
} from "../../utils/questdb/types"

type ViewRow = {
  view_name: string
  view_status: unknown
  invalidation_reason: unknown
}

type ViewStatus<T extends ViewRow> = Pick<
  T,
  "view_status" | "invalidation_reason"
>

export type TableStatusUpdate = {
  tableName: string
  kind: TableKind
  table?: Pick<Table, "table_suspended">
  matView?: ViewStatus<MaterializedView>
  view?: ViewStatus<View>
  liveView?: ViewStatus<LiveView>
}

export const pickViewStatus = <T extends ViewRow>(
  row: T | null,
): ViewStatus<T> | undefined =>
  row
    ? {
        view_status: row.view_status,
        invalidation_reason: row.invalidation_reason,
      }
    : undefined

export const publishTableStatusUpdate = (update: TableStatusUpdate) => {
  eventBus.publish(EventType.MSG_TABLE_STATUS_UPDATE, update)
}

export const subscribeTableStatusUpdate = (
  handler: (update: TableStatusUpdate) => void,
) => {
  const listener = (update?: TableStatusUpdate) => {
    if (update) handler(update)
  }
  eventBus.subscribe(EventType.MSG_TABLE_STATUS_UPDATE, listener)
  return () => eventBus.unsubscribe(EventType.MSG_TABLE_STATUS_UPDATE, listener)
}

export const patchRowStatus = <T extends object>(
  rows: T[],
  isTargetRow: (row: T) => boolean,
  status: Partial<T> | undefined,
): T[] => {
  if (!status) return rows
  const index = rows.findIndex(isTargetRow)
  if (index === -1) return rows
  const target = rows[index]
  const statusKeys = Object.keys(status) as (keyof T)[]
  if (statusKeys.every((key) => target[key] === status[key])) return rows
  return rows.map((row, i) => (i === index ? { ...row, ...status } : row))
}
