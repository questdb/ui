import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { EChartsOption, EChartsType } from "echarts"
import styled, { useTheme } from "styled-components"
import type { CellInteractions } from "../../../../store/notebook"
import { withBrush } from "../interactions/chartInteractions"
import {
  ChartRenderer,
  type ChartEventHandler,
} from "../CellChart/ChartRenderer"
import type { StatementRows } from "../visuals/statementRows"
import { useReportOutcome } from "../drawOutcome"
import { DrawOutcomePane } from "../DrawOutcomePane"
import { datasetPick } from "./buildCustomOption"
import { ensureMaps, isMapLoaded, mapsUsedBy } from "./maps"
import { prepareCustomOption } from "./prepareCustomOption"
import { customDraw } from "./customOutcome"
import { resetChartZoom } from "../cellVirtualization/chartZoomStore"

const PartialNotice = styled.div`
  height: 2.8rem;
  padding: 0.5rem 1rem;
  overflow: auto;
  color: ${({ theme }) => theme.color.contentPrimary};
`

type Props = {
  bufferId: number
  cellId: string
  rawOption: Record<string, unknown>
  statements: (StatementRows | null)[]
  // Each statement's error, null for one that succeeded.
  statementErrors?: (string | null)[]
  live: boolean
  isFocused: boolean
  interactions?: CellInteractions
  events?: Record<string, ChartEventHandler>
  onInstance?: React.ComponentProps<typeof ChartRenderer>["onInstance"]
  onDraw?: React.ComponentProps<typeof ChartRenderer>["onDraw"]
}

/** Draws an agent-written ECharts option over the cell's statements. */
export const CustomChart = ({
  bufferId,
  cellId,
  rawOption,
  statements,
  statementErrors,
  live,
  isFocused,
  interactions,
  events,
  onInstance,
  onDraw,
}: Props) => {
  const theme = useTheme()
  const zoomScope = useMemo(() => ({ bufferId, cellId }), [bufferId, cellId])
  // The option's content, so a save that leaves it unchanged (a new object
  // with the same JSON) keeps the chart's zoom.
  const optionKey = useMemo(() => JSON.stringify(rawOption), [rawOption])
  // An edited option opens on its own zoom windows, as a new chart would.
  const drawnKey = useRef(optionKey)
  useLayoutEffect(() => {
    if (drawnKey.current === optionKey) return
    drawnKey.current = optionKey
    resetChartZoom(zoomScope, { localOnly: true })
  }, [optionKey, zoomScope])
  // The option drawn, for the click: a dataset-bound series' marks are rows
  // of a statement, drawn from the column its encoding names.
  const drawnRef = useRef<{
    option: Record<string, unknown>
    statements: (StatementRows | null)[]
  } | null>(null)
  const chartEvents = useMemo(
    () => ({
      ...events,
      ...(events?.click
        ? {
            click: (payload: unknown, instance: EChartsType) => {
              const drawn = drawnRef.current
              const { seriesIndex, value } = payload as {
                seriesIndex?: unknown
                value?: unknown
              }
              const pick =
                drawn && typeof seriesIndex === "number"
                  ? datasetPick(
                      drawn.option,
                      drawn.statements,
                      seriesIndex,
                      value,
                    )
                  : undefined
              events.click?.(
                pick ? { ...(payload as object), pick } : payload,
                instance,
              )
            },
          }
        : {}),
    }),
    [events],
  )
  const clickable = interactions?.click !== undefined
  const prepared = useMemo(
    () =>
      prepareCustomOption(rawOption, {
        colors: theme.color,
        statements,
        live,
        pickable: clickable,
      }),
    [rawOption, theme.color, statements, live, clickable],
  )
  const { built } = prepared
  useEffect(() => {
    drawnRef.current = { option: built.option, statements }
  }, [built, statements])
  const option = useMemo(
    () => withBrush(built.option as EChartsOption, interactions),
    [built, interactions],
  )
  // Keyed by the map names, so a data refresh does not reload (or retry a
  // failed load of) the same maps.
  const neededMapsKey = useMemo(
    () => mapsUsedBy(built.option).join("\n"),
    [built],
  )
  const neededMaps = useMemo(
    () => (neededMapsKey === "" ? [] : neededMapsKey.split("\n")),
    [neededMapsKey],
  )
  const [mapStatus, setMapStatus] = useState<"loading" | "error" | "ready">(
    () => (neededMaps.every(isMapLoaded) ? "ready" : "loading"),
  )
  useEffect(() => {
    if (neededMaps.every(isMapLoaded)) {
      setMapStatus("ready")
      return
    }
    setMapStatus("loading")
    let cancelled = false
    void ensureMaps(neededMaps).then(
      () => !cancelled && setMapStatus("ready"),
      () => !cancelled && setMapStatus("error"),
    )
    return () => {
      cancelled = true
    }
  }, [neededMaps])

  // What the option shows, decided once: the pane draws it and the agent's
  // report carries it.
  const { outcome, partial } = useMemo(
    () => customDraw({ prepared, statements, statementErrors, mapStatus }),
    [prepared, statements, statementErrors, mapStatus],
  )
  useReportOutcome(bufferId, cellId, "custom", outcome)

  if (outcome.status !== "drawn") return <DrawOutcomePane outcome={outcome} />
  return (
    <>
      {partial.length > 0 && (
        <PartialNotice role="status">
          {partial.map(({ message }) => message).join(" ")}
        </PartialNotice>
      )}
      <ChartRenderer
        option={option}
        height={partial.length > 0 ? "calc(100% - 2.8rem)" : undefined}
        isFocused={isFocused}
        animate={!live}
        zoomScope={zoomScope}
        zoomable={false}
        fit
        events={chartEvents}
        onInstance={onInstance}
        onDraw={onDraw}
      />
    </>
  )
}
