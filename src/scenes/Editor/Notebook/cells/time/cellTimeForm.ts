import Joi from "joi"
import type { TimeRange } from "../../../../../store/notebook"
import {
  timeRangeSchema,
  toStoredBound,
} from "../../../TimeRangePicker/rangeSchema"
import {
  cellTimeEntries,
  parseTimeShift,
  TIME_SHIFT_ERROR,
  type CellTime,
} from "../../variables/cellTime"
import { isValidTimeRange } from "../../variables/timeRange"

export type CellTimeFormValues = {
  dateFrom: string
  dateTo: string
  shift: string
  showInHeader: boolean
}

export const SHIFT_PRESETS = ["-1h", "-6h", "-1d", "-1w", "+1d"]

export const cellTimeFormValues = (cell: CellTime): CellTimeFormValues => ({
  dateFrom: cell.timeRange?.from ?? "",
  dateTo: cell.timeRange?.to ?? "",
  shift: cell.timeShift ?? "",
  showInHeader: cell.showTimeRange === true,
})

export const cellTimeFormSchema = timeRangeSchema({ allowEmpty: true }).keys({
  shift: Joi.string()
    .allow("")
    .custom((value: string, helpers) =>
      value === "" || parseTimeShift(value)
        ? value
        : helpers.error("string.timeShift"),
    )
    .messages({ "string.timeShift": TIME_SHIFT_ERROR }),
  showInHeader: Joi.boolean(),
})

export const cellTimeFromForm = (values: CellTimeFormValues): CellTime => {
  const timeRange =
    values.dateFrom && values.dateTo
      ? {
          from: toStoredBound(values.dateFrom),
          to: toStoredBound(values.dateTo),
        }
      : undefined
  const timeShift = values.shift === "" ? undefined : values.shift
  const hasTime = timeRange !== undefined || timeShift !== undefined
  return {
    timeRange,
    timeShift,
    showTimeRange: values.showInHeader && hasTime ? true : undefined,
  }
}

export const sameCellTimeForm = (
  a: CellTimeFormValues,
  b: CellTimeFormValues,
): boolean =>
  a.dateFrom === b.dateFrom &&
  a.dateTo === b.dateTo &&
  a.shift === b.shift &&
  a.showInHeader === b.showInHeader

export const previewEntries = (
  notebookRange: TimeRange | undefined,
  values: CellTimeFormValues,
) => {
  const range = { from: values.dateFrom, to: values.dateTo }
  return cellTimeEntries(notebookRange, {
    timeRange: isValidTimeRange(range) ? range : undefined,
    timeShift: parseTimeShift(values.shift) ? values.shift : undefined,
  })
}
