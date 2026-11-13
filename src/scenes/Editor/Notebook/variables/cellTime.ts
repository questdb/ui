import type {
  DeclareEntry,
  NotebookCell,
  TimeRange,
} from "../../../../store/notebook"
import {
  durationToHumanReadable,
  type DurationPreset,
} from "../../TimeRangePicker/utils"
import {
  isTimeVariableName,
  isValidTimeRange,
  timeRangeToDeclareEntries,
  type TimeShift,
  type TimeShiftUnit,
} from "./timeRange"

export type CellTime = Pick<
  NotebookCell,
  "timeRange" | "timeShift" | "showTimeRange"
>

const TIME_SHIFT_RE = /^([+-])([1-9]\d{0,3})([smhdwMy])$/

export const TIME_SHIFT_ERROR =
  "Start with - for the past or + for the future, then a whole number from 1 to 9999 and one of s, m, h, d, w, M, y."

export const parseTimeShift = (token: string): TimeShift | null => {
  const match = TIME_SHIFT_RE.exec(token)
  if (!match) return null
  const [, sign, amount, unit] = match
  return {
    amount: sign === "-" ? -Number(amount) : Number(amount),
    unit: unit as TimeShiftUnit,
  }
}

export const cellTimeEntries = (
  notebookRange: TimeRange | undefined,
  cell: CellTime,
): DeclareEntry[] => {
  const range = cell.timeRange ?? notebookRange
  if (!range) return []
  const shift = cell.timeShift ? parseTimeShift(cell.timeShift) : null
  return timeRangeToDeclareEntries(range, shift ?? undefined)
}

export const hasCellTime = (cell: CellTime): boolean =>
  cell.timeRange !== undefined || cell.timeShift !== undefined

export const withCellTime = (
  entries: DeclareEntry[],
  notebookRange: TimeRange | undefined,
  cell: CellTime,
): DeclareEntry[] => {
  if (!hasCellTime(cell)) return entries
  return [
    ...cellTimeEntries(notebookRange, cell),
    ...entries.filter((entry) => !isTimeVariableName(entry.name)),
  ]
}

export const describeCellTime = (
  cell: CellTime,
  presets: DurationPreset[],
): string | null => {
  const parts = [
    cell.timeRange
      ? durationToHumanReadable(cell.timeRange.from, cell.timeRange.to, presets)
      : null,
    cell.timeShift ?? null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(", ") : null
}

export const readCellTime = (
  raw: Record<string, unknown>,
  type: NotebookCell["type"],
): CellTime => {
  if (type === "markdown") return {}
  const out: CellTime = {}
  if (isValidTimeRange(raw.timeRange)) {
    out.timeRange = { from: raw.timeRange.from, to: raw.timeRange.to }
  }
  if (typeof raw.timeShift === "string" && parseTimeShift(raw.timeShift)) {
    out.timeShift = raw.timeShift
  }
  if (raw.showTimeRange === true && hasCellTime(out)) out.showTimeRange = true
  return out
}
