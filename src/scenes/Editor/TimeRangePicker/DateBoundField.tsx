import React from "react"
import { useFormContext } from "react-hook-form"
import { Box, Button, Calendar, Form, Popover } from "../../../components"
import { Calendar as CalendarIcon } from "../../../components/icons"
import { utcToLocal } from "../../../utils"
import { durationTokenToDate, type DateRange } from "./utils"

type Props = DateRange & {
  min: Date
  max: Date
  name: string
  label: string
  placeholder: string
}

export const DateBoundField = ({
  min,
  max,
  name,
  label,
  placeholder,
  dateFrom,
  dateTo,
}: Props) => {
  const { setValue } = useFormContext()

  const fromDate = durationTokenToDate(dateFrom)
  const toDate = durationTokenToDate(dateTo)

  return (
    <Form.Item name={name} label={label}>
      <Box gap="0.5rem" align="center">
        <Form.Input
          name={name}
          placeholder={placeholder}
          data-hook={`time-range-${name}`}
        />
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
