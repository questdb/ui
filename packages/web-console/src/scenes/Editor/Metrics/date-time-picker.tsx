import React, { useEffect, useState } from "react"
import styled from "styled-components"
import {
  metricDurations,
  durationToHumanReadable,
  durationTokenToDate,
  isDateToken,
  MAX_DATE_RANGE,
} from "./utils"
import { DateRange } from "./types"
import { Box, Button, Popover } from "@questdb/react-components"
import {
  Calendar as CalendarIcon,
  Time,
  World,
} from "@styled-icons/boxicons-regular"
import { ArrowDropDown, ArrowDropUp } from "@styled-icons/remix-line"
import { Text } from "../../../components"
import { getLocalTimeZone, getLocalGMTOffset } from "../../../utils"
import { Form } from "../../../components/Form"
import { Calendar } from "../../../components/Calendar"
import { formatISO, subMonths } from "date-fns"
import { useFormContext } from "react-hook-form"
import Joi from "joi"
import { utcToLocal } from "../../../utils"

const Root = styled(Box).attrs({
  gap: "1rem",
  flexDirection: "column",
  align: "flex-start",
})`
  background: ${({ theme }: { theme: any }) => theme.color.backgroundDarker};
  width: 50rem;
  padding: 1rem 1rem 0 1rem;
`

const Cols = styled(Box).attrs({ gap: 0, align: "flex-start" })`
  width: 100%;
`

const Trigger = styled(Button)`
  padding-right: 0;
`

const DatePickers = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
  align: "flex-start",
})`
  width: 70%;
  align-self: flex-start;
  padding-right: 1rem;
  padding-left: 1rem;
`

const MetricDurations = styled.ul`
  width: 40%;
  list-style: none;
  margin: 0;
  padding: 0 0 0 1rem;
  border-left: 1px solid ${({ theme }: { theme: any }) => theme.color.selection};
`

const MetricDurationItem = styled.li<{ selected?: boolean }>`
  cursor: pointer;
  height: 3rem;
  padding: 0 1rem;
  line-height: 3rem;

  &:hover {
    background: ${({ theme }) => theme.color.selection};
  }

  ${({ selected, theme }) =>
    selected && `& { background: ${theme.color.selection}; }`}
`

const Footer = styled(Box).attrs({
  gap: 0,
  align: "center",
})`
  width: 100%;
  padding: 1rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.selection};
`

const DatePickerItem = ({
  min,
  max,
  name,
  label,
  dateFrom,
  dateTo,
  onChange,
}: DateRange & {
  min: Date
  max: Date
  name: string
  label: string
  onChange: (date: string[]) => void
}) => {
  const { setValue } = useFormContext()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(name, e.target.value)
    try {
      const dateValue = durationTokenToDate(e.target.value)
      if (dateValue === "Invalid date") {
        return
      }
      if (name === "dateFrom") {
        onChange([dateValue, dateTo])
      } else if (name === "dateTo") {
        onChange([dateFrom, dateValue])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fromDate = durationTokenToDate(dateFrom)
  const toDate = durationTokenToDate(dateTo)

  return (
    <Form.Item name={name} label={label}>
      <Box gap="0.5rem" align="center">
        <Form.Input name={name} onChange={handleChange} placeholder="now" />
        <Popover
          trigger={
            <Button skin="secondary">
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
              fromDate !== "Invalid date"
                ? new Date(durationTokenToDate(dateFrom))
                : new Date(),
              toDate! == "Invalid date"
                ? new Date(durationTokenToDate(dateTo))
                : new Date(),
            ]}
            selectRange={true}
          />
        </Popover>
      </Box>
    </Form.Item>
  )
}

type FormValues = DateRange

export const DateTimePicker = ({
  dateFrom,
  dateTo,
  onDateFromToChange,
}: DateRange & {
  // This can be either a date string or something like `now-2h` which does not exist on the list
  onDateFromToChange: (dateFrom: string, dateTo: string) => void
}) => {
  const [mainOpen, setMainOpen] = useState(false)
  const [currentDateFrom, setCurrentDateFrom] = useState(dateFrom)
  const [currentDateTo, setCurrentDateTo] = useState(dateTo)

  const handleSubmit = async (values: FormValues) => {
    if (values.dateFrom && values.dateTo) {
      onDateFromToChange(
        isDateToken(values.dateFrom)
          ? values.dateFrom
          : formatISO(values.dateFrom),
        isDateToken(values.dateTo) ? values.dateTo : formatISO(values.dateTo),
      )
      setMainOpen(false)
    }
  }

  const min = subMonths(new Date(), 12)
  const max = new Date()

  const errorMessages = {
    "string.empty": "Please enter a date or duration",
    "string.invalidDate": "Date format or duration is invalid",
    "string.toIsBeforeFrom": "To date must be after From date",
    "string.dateInFuture": "Please set a date in the past or use `now`",
    "string.fromIsAfterTo": "From date must be before To date",
    "string.sameValues": "From and To dates cannot be the same",
    "any.custom": "One of the values is invalid",
    "string.maxDateRange": "Date range cannot exceed 7 days",
  }

  const schema = Joi.object({
    dateFrom: Joi.any()
      .required()
      .custom((value: any, helpers: any) => {
        const dateValue = durationTokenToDate(value)
        const timeValue = new Date(dateValue).getTime()
        const timeNow = new Date().getTime()
        try {
          const timeTo = new Date(
            durationTokenToDate(helpers.state.ancestors[0].dateTo),
          ).getTime()
          if (dateValue === "Invalid date") {
            return helpers.error("string.invalidDate")
          } else if (timeValue >= timeTo) {
            return helpers.error("string.fromIsAfterTo")
          } else if (timeValue > timeNow) {
            return helpers.error("string.dateInFuture")
          } else if (timeValue === timeNow) {
            return helpers.error("string.sameValues")
          } else if (timeTo - timeValue > MAX_DATE_RANGE * 1000) {
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
      .custom((value: any, helpers: any) => {
        const dateValue = durationTokenToDate(value)
        const timeValue = new Date(dateValue).getTime()
        const timeNow = new Date().getTime()
        const timeFrom = new Date(
          durationTokenToDate(helpers.state.ancestors[0].dateFrom),
        ).getTime()
        if (dateValue === "Invalid date") {
          return helpers.error("string.invalidDate")
        } else if (timeValue <= timeFrom) {
          return helpers.error("string.toIsBeforeFrom")
        } else if (timeValue > timeNow) {
          return helpers.error("string.dateInFuture")
        } else if (timeValue === timeNow) {
          return helpers.error("string.sameValues")
        } else if (timeValue - timeFrom > MAX_DATE_RANGE * 1000) {
          return helpers.error("string.maxDateRange")
        }
        return value
      })
      .messages(errorMessages),
  })

  const datePickerProps = {
    min,
    max,
    dateFrom: currentDateFrom,
    dateTo: currentDateTo,
    onChange: ([from, to]: string[]) => {
      setCurrentDateFrom(from)
      setCurrentDateTo(to)
    },
  }

  useEffect(() => {
    setCurrentDateFrom(dateFrom)
    setCurrentDateTo(dateTo)
  }, [dateFrom, dateTo])

  return (
    <Popover
      open={mainOpen}
      onOpenChange={setMainOpen}
      trigger={
        <Trigger skin="secondary" prefixIcon={<Time size="18px" />}>
          {durationToHumanReadable(dateFrom, dateTo)}
          {mainOpen ? (
            <ArrowDropUp size="28px" />
          ) : (
            <ArrowDropDown size="28px" />
          )}
        </Trigger>
      }
    >
      <Root>
        <Cols>
          <DatePickers>
            <Text weight={600} color="foreground" size="lg">
              Absolute time range
            </Text>
            <Form
              name="dateRanges"
              onSubmit={handleSubmit}
              defaultValues={{ dateFrom, dateTo }}
              validationSchema={schema}
            >
              <Box flexDirection="column" gap="1rem" align="flex-start">
                <DatePickerItem
                  name="dateFrom"
                  label="From"
                  {...datePickerProps}
                />
                <DatePickerItem name="dateTo" label="To" {...datePickerProps} />
                <Form.Submit>Apply</Form.Submit>
              </Box>
            </Form>
          </DatePickers>
          <MetricDurations>
            {Object.values(metricDurations).map(
              ({ label, dateFrom: mFrom, dateTo: mTo }) => (
                <MetricDurationItem
                  key={label}
                  selected={dateFrom === mFrom && dateTo === mTo}
                  onClick={() => {
                    onDateFromToChange(mFrom, mTo)
                    setMainOpen(false)
                  }}
                >
                  {label}
                </MetricDurationItem>
              ),
            )}
          </MetricDurations>
        </Cols>
        <Footer>
          <Box gap="0.5rem" align="center">
            <World size="14px" />
            <Text color="foreground">
              {getLocalTimeZone()} ({getLocalGMTOffset()})
            </Text>
          </Box>
        </Footer>
      </Root>
    </Popover>
  )
}
