import { type Buffer, BufferType, bufferTypeOf } from "../../store/buffers"

export type TabKind = "notebook" | "sql" | "metrics"

export type WorkspaceTab = {
  buffer_id: number
  label: string
  kind: TabKind
  archived: boolean
  bound_to_this_chat?: boolean
}

export type WorkspaceInfo = {
  tabs: WorkspaceTab[]
  active?: {
    buffer_id: number
    label: string
    kind: TabKind
    archived?: boolean
  }
}

const KIND_BY_TYPE: Record<BufferType, TabKind> = {
  [BufferType.NOTEBOOK]: "notebook",
  [BufferType.METRICS]: "metrics",
  [BufferType.SQL]: "sql",
}

export const tabKindOf = (buffer: Buffer): TabKind =>
  KIND_BY_TYPE[bufferTypeOf(buffer)]

export const buildWorkspaceInfo = (
  buffers: Buffer[],
  activeBuffer: Buffer,
  boundBufferId?: number,
): WorkspaceInfo | undefined => {
  const tabs = buffers
    .filter((b) => typeof b.id === "number" && !b.isPreviewBuffer)
    .map((b) => ({
      buffer_id: b.id as number,
      label: b.label,
      kind: tabKindOf(b),
      archived: b.archived === true,
      ...(b.id === boundBufferId ? { bound_to_this_chat: true } : {}),
    }))
  const hasActive =
    typeof activeBuffer.id === "number" && !activeBuffer.isPreviewBuffer
  if (tabs.length === 0 && !hasActive) return undefined
  return {
    tabs,
    ...(hasActive
      ? {
          active: {
            buffer_id: activeBuffer.id as number,
            label: activeBuffer.label,
            kind: tabKindOf(activeBuffer),
            archived: activeBuffer.archived === true,
          },
        }
      : {}),
  }
}
