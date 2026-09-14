import React, { useState } from "react"
import styled from "styled-components"
import { formatISO, subMonths } from "date-fns"
import { useFormContext } from "react-hook-form"
import Joi from "joi"
import { Box, Button, Calendar, Form, Popover, Text } from "../../../components"
import {
  Calendar as CalendarIcon,
  Time,
  World,
} from "../../../components/icons"
import { getLocalGMTOffset, getLocalTimeZone, utcToLocal } from "../../../utils"
import { EditorRefreshIntervalTriggerButton } from "../ToolbarRefreshControls"
import {
  durationToHumanReadable,
  durationTokenToDate,
  isDateToken,
  type DateRange,
  type DurationPreset,
} from "./utils"

const Root = styled(Box).attrs({
  gap: "1rem",
  flexDirection: "column",
  align: "flex-start",
})`
  color: ${({ theme }) => theme.color.contentSecondary};
  width: 50rem;
  padding: 1rem 1rem 0 1rem;
`

const Cols = styled(Box).attrs({ gap: 0, align: "flex-start" })`
  width: 100%;
`

const DatePickers = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
  align: "flex-start",
})`
  width: 70%;
  flex: 0 0 70%;
  align-self: stretch;
  padding-right: 1rem;
  padding-left: 1rem;
`

const Presets = styled.ul`
  width: 30%;
  flex: 0 0 30%;
  list-style: none;
  margin: 0;
  padding: 0 0 0 1rem;
  border-left: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const PresetItem = styled.li<{ selected?: boolean }>`
  cursor: pointer;
  height: 3rem;
  padding: 0 1rem;
  line-height: 3rem;
  color: ${({ theme }) => theme.color.contentSecondary};

  &:hover {
    background: ${({ theme }) => theme.color.interactionNeutral};
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  ${({ selected, theme }) =>
    selected &&
    `& {
      background: ${theme.color.interactionNeutral};
      color: ${theme.color.contentPrimary};
    }`}
`

const Footer = styled(Box).attrs({
  gap: "1rem",
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  padding: 1rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const FooterActions = styled(Box).attrs({ gap: "1rem", align: "center" })``

const DatePickerItem = ({
  min,
  max,
  name,
  label,
  placeholder,
  dateFrom,
  dateTo,
}: DateRange & {
  min: Date
  max: Date
  name: string
  label: string
  placeholder: string
}) => {
  const { setValue } = useFormContext()

  const fromDate = durationTokenToDate(dateFrom)
  const toDate = durationTokenToDate(dateTo)

  return (
    <Form.Item name={name} label={label}>
      <Box gap="0.5rem" align="center">
        <Form.Input name={name} placeholder={placeholder} />
        <Popover
          trigger={
            <Button variant="secondary">
              {" "}
              <CalendarIcon size="18px" />{" "}
            </Button>
          }
          align="center"
        >
          <Calendar
            min={min}
            max={max}
            onChange={(values) => {
              const vals = values as string[]

              ;["dateFrom", "dateTo"].forEach((name, index) => {
                if (values && vals[index]) {
                  setValue(name, utcToLocal(new Date(vals[index]).getTime()))
                }
              })
            }}
            value={[
              fromDate !== "Invalid date" ? new Date(fromDate) : new Date(),
              toDate !== "Invalid date" ? new Date(toDate) : new Date(),
            ]}
            selectRange
          />
        </Popover>
      </Box>
    </Form.Item>
  )
}

type FormValues = DateRange

type Props = {
  dateFrom?: string
  dateTo?: string
  presets: DurationPreset[]
  maxRangeSeconds?: number
  renderPreview?: (dateFrom: string, dateTo: string) => React.ReactNode
  onApply: (dateFrom: string, dateTo: string) => Promise<void> | void
  onClear?: () => void
  dataHook?: string
}

export const TimeRangePicker = ({
  dateFrom,
  dateTo,
  presets,
  maxRangeSeconds,
  renderPreview,
  onApply,
  onClear,
  dataHook,
}: Props) => {
  const appliedRange = { dateFrom: dateFrom ?? "", dateTo: dateTo ?? "" }
  const [mainOpen, setMainOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(appliedRange)
  const hasRange = dateFrom !== undefined && dateTo !== undefined

  const handleOpenChange = (open: boolean) => {
    if (open) setDraft(appliedRange)
    setMainOpen(open)
  }

  const handleSubmit = async (values: FormValues) => {
    if (values.dateFrom && values.dateTo) {
      await onApply(
        isDateToken(values.dateFrom)
          ? values.dateFrom
          : formatISO(values.dateFrom),
        isDateToken(values.dateTo) ? values.dateTo : formatISO(values.dateTo),
      )
      setMainOpen(false)
    }
  }

  const handleClear = () => {
    onClear?.()
    setMainOpen(false)
  }

  const min = subMonths(new Date(), 12)
  const max = new Date()
  const maxRangeDays = maxRangeSeconds
    ? Math.round(maxRangeSeconds / 86400)
    : undefined

  const errorMessages = {
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

  const schema = Joi.object({
    dateFrom: Joi.any()
      .required()
      .custom((value: string, helpers) => {
        const dateValue = durationTokenToDate(value)
        const timeValue = new Date(dateValue).getTime()
        const timeNow = new Date().getTime()
        try {
          const timeTo = new Date(
            durationTokenToDate(
              (helpers.state.ancestors as unknown as FormValues[])[0].dateTo,
            ),
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
      .messages(errorMessages),
    dateTo: Joi.any()
      .required()
      .custom((value: string, helpers) => {
        const dateValue = durationTokenToDate(value)
        const timeValue = new Date(dateValue).getTime()
        const timeNow = new Date().getTime()
        const timeFrom = new Date(
          durationTokenToDate(
            (helpers.state.ancestors as unknown as FormValues[])[0].dateFrom,
          ),
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
      .messages(errorMessages),
  })

  const datePickerProps = { min, max, ...draft }

  return (
    <Popover
      open={mainOpen}
      onOpenChange={handleOpenChange}
      trigger={
        <EditorRefreshIntervalTriggerButton
          label={
            hasRange
              ? durationToHumanReadable(dateFrom, dateTo, presets)
              : "Time range"
          }
          leadingIcon={<Time size="18px" />}
          type="button"
          aria-label="Time range"
          aria-expanded={mainOpen}
          data-hook={dataHook}
        />
      }
    >
      <Root>
        <Cols>
          <DatePickers>
            <Text weight={600} color="contentPrimary" size="lg">
              Absolute time range
            </Text>
            <Form
              name="dateRanges"
              onSubmit={handleSubmit}
              onChange={(values) =>
                setDraft({
                  dateFrom: values.dateFrom ?? "",
                  dateTo: values.dateTo ?? "",
                })
              }
              defaultValues={appliedRange}
              validationSchema={schema}
            >
              <Box flexDirection="column" gap="1rem" align="flex-start">
                <DatePickerItem
                  name="dateFrom"
                  label="From"
                  placeholder="now-1h"
                  {...datePickerProps}
                />
                <DatePickerItem
                  name="dateTo"
                  label="To"
                  placeholder="now"
                  {...datePickerProps}
                />
                <Form.Submit>Apply</Form.Submit>
              </Box>
            </Form>
            <Box margin="auto 0 0 0">
              {renderPreview?.(draft.dateFrom, draft.dateTo)}
            </Box>
          </DatePickers>
          <Presets>
            {presets.map(
              ({ label, dateFrom: presetFrom, dateTo: presetTo }) => (
                <PresetItem
                  key={label}
                  selected={dateFrom === presetFrom && dateTo === presetTo}
                  onClick={async () => {
                    await onApply(presetFrom, presetTo)
                    setMainOpen(false)
                  }}
                >
                  {label}
                </PresetItem>
              ),
            )}
          </Presets>
        </Cols>
        <Footer>
          <Box gap="0.5rem" align="center">
            <World size="14px" />
            <Text color="contentPrimary">
              {getLocalTimeZone()} ({getLocalGMTOffset()})
            </Text>
          </Box>
          <FooterActions>
            {onClear && hasRange && (
              <Button variant="secondary" onClick={handleClear}>
                Clear
              </Button>
            )}
          </FooterActions>
        </Footer>
      </Root>
    </Popover>
  )
}
