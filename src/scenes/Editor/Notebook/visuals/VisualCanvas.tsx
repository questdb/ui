import React, { useCallback, useEffect, useMemo } from "react"
import styled, { useTheme } from "styled-components"
import type { VisualConfig } from "../CellChart/chartTypes"
import type { CellInteractions } from "../../../../store/notebook"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import {
  ChartRenderer,
  type ChartEventHandler,
} from "../CellChart/ChartRenderer"
import { useReportOutcome } from "../drawOutcome"
import { DrawOutcomePane } from "../DrawOutcomePane"
import type { SetVariables } from "../interactions/chartInteractions"
import { pickLiteral, type Pick } from "../interactions/selection"
import type { StatementRows } from "./statementRows"
import { visualDraw } from "./visualOutcome"
import { OrderBook } from "./OrderBook"
import { StatTiles } from "./StatTiles"
import { Bullets } from "./Bullets"
import { PlanTree } from "./PlanTree"
import { UptimeBars } from "./UptimeBars"
import { MAP_NAMES, ensureMaps, isMapLoaded } from "../customChart/maps"

const Fill = styled.div`
  height: 100%;
  min-height: 0;
`

const useWorldMap = (needed: boolean) => {
  const [status, setStatus] = React.useState<"ready" | "loading" | "error">(
    () => (!needed || isMapLoaded(MAP_NAMES[0]) ? "ready" : "loading"),
  )
  useEffect(() => {
    if (!needed || isMapLoaded(MAP_NAMES[0])) {
      setStatus("ready")
      return
    }
    setStatus("loading")
    let cancelled = false
    void ensureMaps([MAP_NAMES[0]]).then(
      () => !cancelled && setStatus("ready"),
      () => !cancelled && setStatus("error"),
    )
    return () => {
      cancelled = true
    }
  }, [needed])
  return status
}

type Props = {
  bufferId: number
  cellId: string
  visual: VisualConfig
  statements: (StatementRows | null)[]
  statementErrors?: (string | null)[]
  formats: ColumnFormats
  interactions: CellInteractions | undefined
  clickVariableValue?: string
  queriesKey?: string
  setVariables: SetVariables
  live: boolean
  isFocused: boolean
  events?: Record<string, ChartEventHandler>
  onInstance?: React.ComponentProps<typeof ChartRenderer>["onInstance"]
  onDraw?: React.ComponentProps<typeof ChartRenderer>["onDraw"]
}

/** Draws a cell's visual (stat tiles, order book, gauge, …) from its statements. */
export const VisualCanvas = ({
  bufferId,
  cellId,
  visual,
  statements,
  statementErrors,
  formats,
  interactions,
  clickVariableValue,
  queriesKey,
  setVariables,
  live,
  isFocused,
  events,
  onInstance,
  onDraw,
}: Props) => {
  const theme = useTheme()
  const zoomScope = useMemo(() => ({ bufferId, cellId }), [bufferId, cellId])
  const mapStatus = useWorldMap(visual.type === "map")
  const click = interactions?.click
  const clickColumn = click?.column
  // What the visual shows, decided once: the pane draws it and the agent's
  // report carries it.
  const { outcome, read } = useMemo(
    () =>
      visualDraw({
        visual,
        statements,
        statementErrors,
        mapStatus,
        colors: theme.color,
        formats,
        clickColumn,
      }),
    [
      visual,
      statements,
      statementErrors,
      mapStatus,
      theme.color,
      formats,
      clickColumn,
    ],
  )
  useReportOutcome(bufferId, cellId, "visual", outcome, visual)
  // What a click on an item of an HTML visual writes, and the click.
  const literalOf = useCallback(
    (pick: Pick) => pickLiteral(pick, clickColumn, statements),
    [clickColumn, statements],
  )
  const select = click
    ? (pick: Pick) => {
        const literal = literalOf(pick)
        if (literal !== undefined) setVariables({ [click.variable]: literal })
      }
    : undefined
  const pickable = click ? literalOf : undefined

  if (outcome.status !== "drawn" || !read)
    return <DrawOutcomePane outcome={outcome} />
  switch (read.kind) {
    case "stat":
      return (
        <StatTiles
          read={read.read}
          visual={visual}
          formats={formats}
          queriesKey={queriesKey}
          selectedValue={click ? clickVariableValue : undefined}
          pickLiteral={pickable}
          onSelect={select}
        />
      )
    case "orderBook":
      return (
        <OrderBook
          read={read.read}
          statementErrors={statementErrors}
          formats={formats}
          animateDigits={visual.animateDigits}
          queriesKey={queriesKey}
          pickLiteral={pickable}
          onSelect={select}
        />
      )
    case "bullet":
      return <Bullets read={read.read} visual={visual} formats={formats} />
    case "planTree":
      return <PlanTree tree={read.tree} />
    case "uptime":
      return (
        <UptimeBars
          read={read.read}
          visual={visual}
          pickLiteral={pickable}
          onSelect={select}
        />
      )
    case "echarts":
      return (
        <Fill>
          <ChartRenderer
            option={read.option}
            isFocused={isFocused}
            animate={!live}
            zoomScope={zoomScope}
            zoomable={false}
            fit
            events={events}
            onInstance={onInstance}
            onDraw={onDraw}
          />
        </Fill>
      )
  }
}
