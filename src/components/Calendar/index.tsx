import React from "react"
import ReactCalendar from "react-calendar"
import type { CalendarProps } from "react-calendar"

type Props = {
  className?: string
  min: Date
  max: Date
  value: CalendarProps["value"]
  selectRange: boolean
  onChange: (value: CalendarProps["value"]) => void
}

export const Calendar = ({
  className,
  min,
  max,
  value,
  onChange,
  selectRange,
}: Props) => (
  <ReactCalendar
    className={className}
    defaultValue={value}
    minDate={min}
    maxDate={max}
    minDetail="month"
    maxDetail="month"
    returnValue="start"
    onChange={(date) => onChange(date)}
    selectRange={selectRange}
  />
)
