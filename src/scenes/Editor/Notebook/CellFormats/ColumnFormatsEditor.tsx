import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { TrashIcon } from "@phosphor-icons/react"
import { IconButton, Text } from "../../../../components"
import { SettingsSelect } from "../CellChart/chartSettingsStyles"
import {
  ExpandableSettingsItem,
  ExpandableSettingsList,
} from "../settingsDrawer/ExpandableSettingsItem"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type {
  ColumnFormat,
  ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import { ColumnFormatFields } from "./ColumnFormatFields"
import { summarise } from "./formatSummary"
import { formatTargetOf } from "../../../../utils/formats/columnFormat"

const Hint = styled(Text)`
  line-height: 1.4;
`

type Props = {
  formats: ColumnFormats | undefined
  onChange: (formats: ColumnFormats | undefined) => void
  // Every column the cell's results have.
  columns: ColumnDefinition[]
  // A value per column from the result, for previews.
  samples: Record<string, unknown>
  // Grid only: offer bars, meters and sparklines in cells.
  cellVisuals: boolean
  // Open this column's format, adding it when it has none (the grid
  // header's "Format column"). Reported back once done, so it happens once
  // per request.
  focusColumn?: string | null
  onFocusHandled?: () => void
}

/** The cell's column formats: one row per formatted column. */
export const ColumnFormatsEditor: React.FC<Props> = ({
  formats,
  onChange,
  columns,
  samples,
  cellVisuals,
  focusColumn,
  onFocusHandled,
}) => {
  const entries = Object.entries(formats ?? {})
  const [expanded, setExpanded] = useState<string | null>(
    focusColumn ?? (entries.length === 1 ? entries[0][0] : null),
  )

  const lastAddedToggle = useRef<HTMLButtonElement>(null)
  const [focusLastAdded, setFocusLastAdded] = useState<string | null>(null)
  useEffect(() => {
    if (focusLastAdded === null) return
    // The last choice removes the menu trigger, so the usual Radix handback
    // has nowhere to go. Wait until its focus scope has closed.
    const frame = requestAnimationFrame(() => {
      lastAddedToggle.current?.focus()
      setFocusLastAdded(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusLastAdded])

  const setFormat = (column: string, format: ColumnFormat | null) => {
    const next = { ...formats }
    if (format === null) delete next[column]
    else next[column] = format
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }

  // The grid header asked for a column: open it, adding it when needed.
  useEffect(() => {
    if (!focusColumn) return
    setExpanded(focusColumn)
    if (!formats?.[focusColumn]) setFormat(focusColumn, {})
    onFocusHandled?.()
    // Runs once per request; the parent clears it through onFocusHandled.
  }, [focusColumn])

  const targetOf = (column: string) => {
    const type = columns.find((c) => c.name === column)?.type
    return type && formatTargetOf(type) === "array" ? "array" : "number"
  }

  // Formats change how numbers read and draw arrays as sparklines (grids).
  const unformatted = columns.filter((c) => {
    if (formats?.[c.name]) return false
    const target = formatTargetOf(c.type)
    return target === "number" || (target === "array" && cellVisuals)
  })

  return (
    <>
      <Hint color="contentSecondary" size="xs">
        How a column&apos;s values read wherever this cell shows them: grid
        cells, chart tooltips and axes, and components.
      </Hint>

      {entries.length === 0 && (
        <Text color="contentSecondary" size="xs">
          {columns.length === 0
            ? "Run the cell to choose from its columns."
            : "No column has a format yet."}
        </Text>
      )}

      {entries.length > 0 && (
        <ExpandableSettingsList aria-label="Column formats">
          {entries.map(([column, format]) => {
            const open = expanded === column
            return (
              <ExpandableSettingsItem
                key={column}
                title={column}
                details={summarise(format)}
                expanded={open}
                toggleRef={
                  focusLastAdded === column ? lastAddedToggle : undefined
                }
                onToggle={() => setExpanded(open ? null : column)}
                actions={
                  <IconButton
                    size="sm"
                    label={`Remove the format of ${column}`}
                    onClick={() => setFormat(column, null)}
                  >
                    <TrashIcon size={14} />
                  </IconButton>
                }
              >
                <ColumnFormatFields
                  column={column}
                  format={format}
                  onChange={(next) => setFormat(column, next)}
                  sample={samples[column]}
                  cellVisuals={cellVisuals}
                  target={targetOf(column)}
                />
              </ExpandableSettingsItem>
            )
          })}
        </ExpandableSettingsList>
      )}

      {unformatted.length > 0 && (
        <SettingsSelect
          name="add-format"
          ariaLabel="Format a column"
          value=""
          placeholder="+ Format a column"
          onValueChange={(column) => {
            if (!column) return
            if (unformatted.length === 1) setFocusLastAdded(column)
            setFormat(column, {})
            setExpanded(column)
          }}
          options={unformatted.map((c) => ({ label: c.name, value: c.name }))}
        />
      )}
    </>
  )
}
