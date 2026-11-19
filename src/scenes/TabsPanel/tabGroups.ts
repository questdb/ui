import { type Buffer, BufferType, bufferTypeOf } from "../../store/buffers"
import {
  sortClosedBuffers,
  sortPinnedBuffers,
} from "../../utils/buffers/tabOrder"

export type TabGroup = {
  type: BufferType
  title: string
  // Open tabs in tab-bar order, then closed tabs newest first.
  rows: Buffer[]
  openCount: number
  closedCount: number
}

const GROUP_ORDER: Array<{ type: BufferType; title: string }> = [
  { type: BufferType.NOTEBOOK, title: "Notebooks" },
  { type: BufferType.SQL, title: "Editors" },
  { type: BufferType.METRICS, title: "Metrics" },
]

export const matchesFilter = (label: string, filter: string) =>
  label.toLowerCase().includes(filter.trim().toLowerCase())

// Groups the user's tabs by kind. The AI diff tab is not a user tab and never
// appears; a notebook opened from an example dashboard is represented by its
// example row instead. Closed tabs are listed only when asked for, except the
// one being previewed: it is on screen, so the panel must be able to explain it.
export const buildTabGroups = (
  buffers: Buffer[],
  { includeClosed, filter }: { includeClosed: boolean; filter: string },
): TabGroup[] => {
  const userTabs = buffers.filter(
    (buffer) =>
      !buffer.isPreviewBuffer &&
      buffer.templateId === undefined &&
      matchesFilter(buffer.label, filter),
  )
  const open = sortPinnedBuffers(userTabs)
  const closed = sortClosedBuffers(userTabs).filter(
    (buffer) => includeClosed || buffer.isTemporary,
  )
  return GROUP_ORDER.map(({ type, title }) => {
    const openOfType = open.filter((buffer) => bufferTypeOf(buffer) === type)
    const closedOfType = closed.filter(
      (buffer) => bufferTypeOf(buffer) === type,
    )
    return {
      type,
      title,
      rows: [...openOfType, ...closedOfType],
      openCount: openOfType.length,
      closedCount: closedOfType.length,
    }
  }).filter((group) => group.rows.length > 0)
}

export const groupCountLabel = (
  group: Pick<TabGroup, "openCount" | "closedCount">,
  includeClosed: boolean,
) =>
  includeClosed
    ? `${group.openCount} open · ${group.closedCount} closed`
    : String(group.openCount)
