import Joi from "joi"
import { formatISO } from "date-fns"
import { durationTokenToDate, isDateToken, type DateRange } from "./utils"

type Options = {
  maxRangeSeconds?: number
  allowEmpty?: boolean
}

export const toStoredBound = (value: string): string =>
  isDateToken(value) ? value : formatISO(value)

const siblingValues = (helpers: Joi.CustomHelpers): DateRange =>
  (helpers.state.ancestors as unknown as DateRange[])[0]

export const timeRangeSchema = ({
  maxRangeSeconds,
  allowEmpty = false,
}: Options = {}) => {
  const maxRangeDays = maxRangeSeconds
    ? Math.round(maxRangeSeconds / 86400)
    : undefined

  const messages = {
    "string.empty": "Please enter a date or duration",
    "string.invalidDate": "Date format or duration is invalid",
    "string.toIsBeforeFrom": "To date must be after From date",
    "string.dateInFuture": "Please set a date in the past or use `now`",
    "string.fromIsAfterTo": "From date must be before To date",
    "string.sameValues": "From and To dates cannot be the same",
    "any.custom": "One of the values is invalid",
    "string.maxDateRange": `Date range cannot exceed ${maxRangeDays} days`,
  }

  const exceedsMaxRange = (spanMs: number) =>
    maxRangeSeconds !== undefined && spanMs > maxRangeSeconds * 1000

  const bothEmpty = (helpers: Joi.CustomHelpers) => {
    const values = siblingValues(helpers)
    return !values.dateFrom && !values.dateTo
  }

  return Joi.object({
    dateFrom: Joi.any()
      .required()
      .custom((value: string, helpers) => {
        if (allowEmpty && bothEmpty(helpers)) return value
        if (value === "") return helpers.error("string.empty")
        const dateValue = durationTokenToDate(value)
        const timeValue = new Date(dateValue).getTime()
        const timeNow = new Date().getTime()
        try {
          const timeTo = new Date(
            durationTokenToDate(siblingValues(helpers).dateTo),
          ).getTime()
          if (dateValue === "Invalid date") {
            return helpers.error("string.invalidDate")
          } else if (timeValue >= timeTo) {
            return helpers.error("string.fromIsAfterTo")
          } else if (timeValue > timeNow) {
            return helpers.error("string.dateInFuture")
          } else if (timeValue === timeNow) {
            return helpers.error("string.sameValues")
          } else if (exceedsMaxRange(timeTo - timeValue)) {
            return helpers.error("string.maxDateRange")
          }
          return value
        } catch (e) {
          return helpers.error("any.custom")
        }
      })
      .messages(messages),
    dateTo: Joi.any()
      .required()
      .custom((value: string, helpers) => {
        if (allowEmpty && bothEmpty(helpers)) return value
        if (value === "") return helpers.error("string.empty")
        const dateValue = durationTokenToDate(value)
        const timeValue = new Date(dateValue).getTime()
        const timeNow = new Date().getTime()
        const timeFrom = new Date(
          durationTokenToDate(siblingValues(helpers).dateFrom),
        ).getTime()
        if (dateValue === "Invalid date") {
          return helpers.error("string.invalidDate")
        } else if (timeValue <= timeFrom) {
          return helpers.error("string.toIsBeforeFrom")
        } else if (timeValue > timeNow) {
          return helpers.error("string.dateInFuture")
        } else if (timeValue === timeNow) {
          return helpers.error("string.sameValues")
        } else if (exceedsMaxRange(timeValue - timeFrom)) {
          return helpers.error("string.maxDateRange")
        }
        return value
      })
      .messages(messages),
  })
}
