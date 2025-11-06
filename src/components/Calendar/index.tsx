import React from "react"
import ReactCalendar from "react-calendar"
import type { CalendarProps } from "react-calendar"
import { LooseValue } from "react-calendar/dist/cjs/shared/types"

type Props = {
  className?: string
  min: Date
  max: Date
  value: LooseValue | undefined
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
