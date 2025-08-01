import React, { useEffect, useState, useCallback, useLayoutEffect } from "react"
import styled from "styled-components"
import {
  metricDurations,
  durationToHumanReadable,
  durationTokenToDate,
  isDateToken,
  MAX_DATE_RANGE,
} from "./utils"
import { DateRange, Duration } from "./types"
import { Box, Button, Popover } from "@questdb/react-components"
import {
  Time,
  World,
} from "@styled-icons/boxicons-regular"
import { ArrowDropDown, ArrowDropUp } from "@styled-icons/remix-line"
import { Text } from "../../../components"
import { getLocalTimeZone, getLocalGMTOffset } from "../../../utils"
import { subMonths, format } from "date-fns"
import { utcToLocal } from "../../../utils"
import { useEffectIgnoreFirst } from "../../../components/Hooks/useEffectIgnoreFirst"

const Root = styled(Box).attrs({
  gap: "1.5rem",
  flexDirection: "column",
  align: "flex-start",
})`
  background: ${({ theme }: { theme: any }) => theme.color.backgroundDarker};
  min-width: 50rem;
  padding: 1.5rem;
`

const Content = styled(Box).attrs({ gap: "1.5rem", align: "flex-start" })`
  flex-direction: column;
  width: 100%;
`

const Trigger = styled(Button)`
  padding-right: 0;
`

const MetricDurations = styled.ul`
  display: grid;
  grid-template-columns: 1fr 1fr;
  list-style: none;
  width: 100%;
  margin: 0;
  padding: 0;
`

const MetricDurationItem = styled.li<{ selected?: boolean }>`
  cursor: pointer;
  height: 3.5rem;
  padding: 0 1.5rem;
  line-height: 3.5rem;
  white-space: nowrap;
  border-radius: 0.25rem;
  margin-bottom: 0.25rem;
  transition: background-color 0.15s ease;
  border: 1px solid transparent;

  &:hover {
    background: ${({ theme }) => theme.color.selection};
  }

  ${({ selected, theme }) =>
    selected && `& { background: ${theme.color.selection}; border: 1px solid ${theme.color.pink}; }`}
`

const Footer = styled(Box).attrs({
  gap: 0,
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  padding: 1.5rem 0 0 0;
  border-top: 1px solid ${({ theme }) => theme.color.selection};
`

const DateTimeSection = styled(Box).attrs({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: "1.5rem",
  align: "flex-start",
})`
  width: 100%;
`

const DateTimeRow = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
  align: "flex-start",
})`
  width: 50%;
`

const DateTimeInput = styled.input<{ disabled?: boolean }>`
  background: ${({ theme, disabled }) => disabled ? theme.color.backgroundDarker : theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.25rem;
  color: ${({ theme, disabled }) => disabled ? theme.color.gray1 : theme.color.foreground};
  padding: 0.75rem;
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'text'};
  opacity: ${({ disabled }) => disabled ? 0.6 : 1};

  &:focus {
    outline: none;
    border-color: ${({ theme, disabled }) => disabled ? theme.color.selection : theme.color.pink};
  }

  &::-webkit-calendar-picker-indicator {
    filter: invert(1) brightness(0.5);
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  }
`

const TimeInput = styled.input<{ disabled?: boolean }>`
  background: ${({ theme, disabled }) => disabled ? theme.color.backgroundDarker : theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.25rem;
  color: ${({ theme, disabled }) => disabled ? theme.color.gray1 : theme.color.foreground};
  padding: 0.75rem;
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'text'};
  opacity: ${({ disabled }) => disabled ? 0.6 : 1};

  &:focus {
    outline: none;
    border-color: ${({ theme, disabled }) => disabled ? theme.color.selection : theme.color.pink};
  }

  &::-webkit-calendar-picker-indicator {
    filter: invert(1) brightness(0.5);
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  }
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.red};
  margin-top: 0.5rem;
`

const Label = styled(Text).attrs({
  size: "sm",
  weight: 500,
  color: "foreground"
})`
  min-width: 40px;
`

export type InvalidDateTimeState = {
  fromDate: string
  fromTime: string
  toDate: string
  toTime: string
  error: string
}

export const DateTimePicker = ({
  dateFrom,
  dateTo,
  onDateFromToChange,
  as = "popover",
  invalidState,
}: DateRange & {
  onDateFromToChange: (dateFrom: string, dateTo: string, invalidState?: InvalidDateTimeState | null) => void
  as?: "popover" | "inline"
  invalidState?: InvalidDateTimeState | null
}) => {
  const [selectedOption, setSelectedOption] = useState<Duration | null>(null)
  const [mainOpen, setMainOpen] = useState(false)
  const [fromDate, setFromDate] = useState("")
  const [fromTime, setFromTime] = useState("")
  const [toDate, setToDate] = useState("")
  const [toTime, setToTime] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handlePredefinedRangeClick = (duration: Duration) => {
    setSelectedOption(duration)
    
    updateInputsFromDateStrings(duration.dateFrom, duration.dateTo)
  }

  const updateInputsFromDateStrings = useCallback((fromDateString: string, toDateString: string) => {
    const fromConversion = isDateToken(fromDateString) ? new Date(durationTokenToDate(fromDateString)) : new Date(fromDateString)
    const toConversion = isDateToken(toDateString) ? new Date(durationTokenToDate(toDateString)) : new Date(toDateString)
    
    setFromDate(format(fromConversion, 'yyyy-MM-dd'))
    setFromTime(format(fromConversion, 'HH:mm'))
    setToDate(format(toConversion, 'yyyy-MM-dd'))
    setToTime(format(toConversion, 'HH:mm'))
  }, [])

  const handleCustomClick = useCallback(() => {
    setSelectedOption(null)
    
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    
    setFromDate(format(oneHourAgo, 'yyyy-MM-dd'))
    setFromTime(format(oneHourAgo, 'HH:mm'))
    setToDate(format(now, 'yyyy-MM-dd'))
    setToTime(format(now, 'HH:mm'))
  }, [])

  const validateAndApplyRange = () => {
    if (selectedOption) {
      onDateFromToChange(selectedOption.dateFrom, selectedOption.dateTo, null)
      setMainOpen(false)
      return
    }

    if (!fromDate || !fromTime || !toDate || !toTime) {
      return "Please fill in all date and time fields"
    }

    const fromDateTime = new Date(`${fromDate}T${fromTime}:00`)
    const toDateTime = new Date(`${toDate}T${toTime}:00`)
    
    if (isNaN(fromDateTime.getTime()) || isNaN(toDateTime.getTime())) {
      return "Please enter valid dates and times"
    }

    const timeFrom = fromDateTime.getTime()
    const timeTo = toDateTime.getTime()
    const timeNow = new Date().getTime()

    if (timeFrom >= timeTo) {
      return "From date/time must be before To date/time"
    }

    if (timeFrom > timeNow || timeTo > timeNow) {
      return "Please select dates and times in the past"
    }

    if (timeTo - timeFrom > MAX_DATE_RANGE * 1000) {
      return "Date range cannot exceed 7 days"
    }

    const fromString = utcToLocal(timeFrom)
    const toString = utcToLocal(timeTo)
    
    onDateFromToChange(fromString, toString, null)
    setMainOpen(false)
  }

  const min = subMonths(new Date(), 12)
  const max = new Date()

  useLayoutEffect(() => {
    if (invalidState) {
      setFromDate(invalidState.fromDate)
      setFromTime(invalidState.fromTime)
      setToDate(invalidState.toDate)
      setToTime(invalidState.toTime)
      setSelectedOption(null)
    } else {
      updateInputsFromDateStrings(dateFrom, dateTo)
      setSelectedOption(metricDurations.find(({ dateFrom: mFrom, dateTo: mTo}) => mFrom === dateFrom && mTo === dateTo) ?? null)
    }
  }, [])

  useEffect(() => {
    if (as === "inline" || (as === "popover" && selectedOption)) {
      const error = validateAndApplyRange()
      if (error) {
        onDateFromToChange(dateFrom, dateTo, {
          fromDate,
          fromTime,
          toDate,
          toTime,
          error
        })
      }
    }
  }, [fromDate, fromTime, toDate, toTime])

  useEffectIgnoreFirst(() => {
    if (as === "inline") {
      updateInputsFromDateStrings(dateFrom, dateTo)
    }
  }, [dateFrom, dateTo])

  const content = () => (
    <Root data-testid="date-time-picker-popover">
      <Content>
        <MetricDurations>
          {metricDurations.map(
            ({ label, dateFrom: mFrom, dateTo: mTo }) => (
              <MetricDurationItem
                key={label}
                selected={selectedOption?.label === label}
                onClick={() => handlePredefinedRangeClick({ label, dateFrom: mFrom, dateTo: mTo })}
              >
                {label}
              </MetricDurationItem>
            ),
          )}
          <MetricDurationItem
            selected={!selectedOption}
            onClick={handleCustomClick}
          >
            Custom
          </MetricDurationItem>
        </MetricDurations>
        
        {!selectedOption && (
          <DateTimeSection>
            <DateTimeRow>
              <Label>From:</Label>
              <div style={{ display: "flex", flexDirection: "row", gap: "0.5rem" }}>
              <DateTimeInput
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={format(max, 'yyyy-MM-dd')}
                min={format(min, 'yyyy-MM-dd')}
                disabled={!!selectedOption}
              />
              <TimeInput
                type="time"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
                disabled={!!selectedOption}
              />
              </div>
            </DateTimeRow>

            <DateTimeRow>
              <Label>To:</Label>
              <div style={{ display: "flex", flexDirection: "row", gap: "0.5rem" }}>
              <DateTimeInput
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                max={format(max, 'yyyy-MM-dd')}
                min={format(min, 'yyyy-MM-dd')}
                disabled={!!selectedOption}
              />
              <TimeInput
                type="time"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
                disabled={!!selectedOption}
              />
              </div>
            </DateTimeRow>
          </DateTimeSection>
        )}
      </Content>
      {error && <ErrorText size="sm" data-testid="error-message">{error}</ErrorText>}
        
      {as === "popover" && !selectedOption && (
        <Footer>
          <Box gap="0.5rem" align="center" data-testid="timezone-info">
            <World size="14px" />
            <Text color="foreground">
              {getLocalTimeZone()} ({getLocalGMTOffset()})
            </Text>
          </Box>
          <Button 
            skin="primary" 
            onClick={() => {
              const error = validateAndApplyRange()
              if (error) {
                setError(error)
              } else {
                setError(null)
              }
            }}
          >
            Apply
          </Button>
        </Footer>
      )}
    </Root>
  )

  if (as === "inline") {
    return content()
  }

  return (
    <Popover
      open={mainOpen}
      align="start"
      onOpenChange={setMainOpen}
      trigger={
        <Trigger 
          skin="secondary" 
          prefixIcon={<Time size="18px" />}
          data-testid="date-time-picker-trigger"
        >
          {durationToHumanReadable(dateFrom, dateTo)}
          {mainOpen ? (
            <ArrowDropUp size="28px" />
          ) : (
            <ArrowDropDown size="28px" />
          )}
        </Trigger>
      }
    >
      {content()}
    </Popover>
  )
}
