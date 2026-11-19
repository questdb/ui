import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { CaretDownIcon, CaretRightIcon, TrashIcon } from "@phosphor-icons/react"
import { Button, SelectMenuControl, Text } from "../../../../components"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type {
  ColumnFormat,
  ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import { ColumnFormatFields } from "./ColumnFormatFields"
import { summarise } from "./formatSummary"
import { formatTargetOf } from "../../../../utils/formats/columnFormat"

const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Item = styled.li<{ $open: boolean }>`
  border: 1px solid
    ${({ theme, $open }) =>
      $open ? theme.color.borderStrong : theme.color.interactionNeutral};
  border-radius: 0.6rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
`

const Header = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.4rem 0.2rem 0.2rem;
`

const Toggle = styled(Button)`
  && {
    justify-content: flex-start;
    gap: 0.6rem;
    min-width: 0;
    height: auto;
    padding: 0.6rem 0.6rem;
    text-align: left;
  }
`

const Name = styled.span`
  font-size: 1.3rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
  white-space: nowrap;
`

const Summary = styled.span`
  min-width: 0;
  overflow: hidden;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Body = styled.div`
  padding: 0.4rem 1rem 1rem;
`

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
        <List aria-label="Column formats">
          {entries.map(([column, format]) => {
            const open = expanded === column
            return (
              <Item key={column} $open={open}>
                <Header>
                  <Toggle
                    type="button"
                    variant="ghost"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : column)}
                  >
                    {open ? (
                      <CaretDownIcon size={14} />
                    ) : (
                      <CaretRightIcon size={14} />
                    )}
                    <Name>{column}</Name>
                    <Summary>{summarise(format)}</Summary>
                  </Toggle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove the format of ${column}`}
                    onClick={() => setFormat(column, null)}
                  >
                    <TrashIcon size={14} />
                  </Button>
                </Header>
                {open && (
                  <Body>
                    <ColumnFormatFields
                      column={column}
                      format={format}
                      onChange={(next) => setFormat(column, next)}
                      sample={samples[column]}
                      cellVisuals={cellVisuals}
                      target={targetOf(column)}
                    />
                  </Body>
                )}
              </Item>
            )
          })}
        </List>
      )}

      {unformatted.length > 0 && (
        <SelectMenuControl
          name="add-format"
          ariaLabel="Format a column"
          value=""
          placeholder="+ Format a column"
          onValueChange={(column) => {
            if (!column) return
            setFormat(column, {})
            setExpanded(column)
          }}
          options={unformatted.map((c) => ({ label: c.name, value: c.name }))}
        />
      )}
    </>
  )
}
