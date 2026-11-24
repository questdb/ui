import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled, { useTheme } from "styled-components"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { ColorShape } from "../../../../types/styled"
import type { VisualConfig } from "../CellChart/chartTypes"
import { withAlpha } from "../../../../theme"
import { pickOf, type Pick } from "../interactions/selection"
import {
  SEVERITY_RANK,
  bucketLanes,
  bucketSeverity,
  latestStateByLane,
  severityOf,
  uptimeByLane,
  type Bucket,
  type Segment,
  type Severity,
  type StateSegments,
} from "./stateSegments"

// Uptime as a status page draws it: one row per lane with its current state,
// a bar per time bucket coloured by the worst state inside it, and the share
// of time up. Hovering a bar lists what happened in it.

const DEFAULT_BUCKETS = 90
const MIN_SLOT_PX = 5

const Root = styled.div`
  position: relative;
  height: 100%;
  overflow: auto;
  padding: 0.4rem 1.6rem 1.2rem;
  font-variant-numeric: tabular-nums;
`

const Summary = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0 1rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentMuted};
`

const Overall = styled.span<{ $color: string; $labelColor: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.3rem;
  font-weight: 600;
  color: ${({ $labelColor }) => $labelColor};

  &::before {
    content: "";
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    box-shadow: 0 0 0 3px ${({ $color }) => withAlpha($color, 0.2)};
  }
`

const Lanes = styled.div`
  position: relative;
`

const Lane = styled.div<{ $clickable: boolean }>`
  position: relative;
  padding: 1.2rem 0 1rem;
  cursor: ${({ $clickable }) => ($clickable ? "pointer" : "default")};

  &[data-lane-index]:not([data-lane-index="0"]) {
    border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  }
`

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.8rem;
`

const Name = styled.span`
  font-size: 1.35rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Current = styled.span<{ $color: string }>`
  font-size: 1.25rem;
  color: ${({ $color }) => $color};
  white-space: nowrap;
`

const Bars = styled.div<{ $count: number; $gap: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $count }) => $count}, 1fr);
  column-gap: ${({ $gap }) => $gap}px;
  height: 2.8rem;
`

const Bar = styled.i<{ $color: string; $active: boolean }>`
  display: block;
  border-radius: 1px;
  background: ${({ $color }) => $color};
  opacity: ${({ $active }) => ($active ? 0.55 : 1)};
  transition: opacity 80ms ease-out;
`

const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  margin-top: 0.6rem;
  font-size: 1.15rem;
  color: ${({ theme }) => theme.color.contentMuted};
  white-space: nowrap;

  hr {
    flex: 1;
    height: 0;
    margin: 0;
    border: 0;
    border-top: 1px solid ${({ theme }) => theme.color.borderDefault};
  }
`

const Card = styled.div`
  position: absolute;
  z-index: 3;
  top: calc(100% - 3.6rem);
  width: 26rem;
  padding: 1rem 1.2rem;
  border-radius: 0.6rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  background: ${({ theme }) => theme.color.surfaceRaised};
  box-shadow: 0 6px 20px ${({ theme }) => theme.color.shadowMedium};
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  pointer-events: none;

  b {
    display: block;
    margin-bottom: 0.6rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  ul {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.3rem 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: contents;
  }

  /* In a lane near the bottom of the pane the card opens above the bars, so
     it is not cut off at the pane's edge. */
  [data-card-above] > & {
    top: auto;
    bottom: calc(100% - 3.2rem);
  }
`

// Opens a lane's bucket card on the side of the lane with more room.
const placeCard = (event: React.MouseEvent<HTMLDivElement>) => {
  const lane = event.currentTarget
  const root = lane.closest('[data-hook="uptime-bars"]')
  if (!root) return
  const shown = lane.getBoundingClientRect()
  const view = root.getBoundingClientRect()
  lane.toggleAttribute(
    "data-card-above",
    view.bottom - shown.bottom < shown.top - view.top,
  )
}

const Dot = styled.span<{ $color: string }>`
  align-self: center;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 2px;
  background: ${({ $color }) => $color};
`

const severityColor = (
  severity: Severity | null,
  colors: ColorShape,
): string => {
  switch (severity) {
    case "bad":
      return colors.chartDown
    case "warning":
      return colors.statusWarning
    case "good":
      return colors.chartUp
    case "neutral":
      return colors.statusInfo
    default:
      return colors.borderDefault
  }
}

const severityTextColor = (
  severity: Severity | null,
  colors: ColorShape,
): string =>
  severity === "bad"
    ? colors.dataNegative
    : severity === "good"
      ? colors.dataPositive
      : colors.contentPrimary

const capitalise = (text: string) =>
  text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text

export const formatDuration = (ms: number): string => {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))} s`
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) {
    const rest = minutes % 60
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`
  }
  return `${Math.round(hours / 24)} days`
}

const spanLabel = (ms: number): string => {
  const hours = ms / 3_600_000
  if (hours >= 48) return `${Math.round(hours / 24)} days`
  if (hours >= 1.5) return `${Math.round(hours)} hours`
  return `${Math.max(1, Math.round(ms / 60_000))} minutes`
}

const DAY = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})
const MOMENT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})
const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
})

const bucketTitle = (bucket: Bucket): string =>
  bucket.to - bucket.from >= 86_400_000
    ? DAY.format(bucket.from)
    : `${MOMENT.format(bucket.from)} – ${CLOCK.format(bucket.to)}`

const useWidth = () => {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!node) {
      setWidth(0)
      return
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, node, width] as const
}

// A lane's bars re-render only when that lane's buckets or hovered bar
// change, not on every bar the pointer enters elsewhere.
const LaneBars = memo(function LaneBars({
  lane,
  buckets,
  count,
  gap,
  activeIndex,
  severity,
  onEnter,
}: {
  lane: string
  buckets: Bucket[]
  count: number
  gap: number
  activeIndex: number | null
  severity: VisualConfig["severity"]
  onEnter: (lane: string, index: number) => void
}) {
  const { color: colors } = useTheme()
  return (
    <Bars $count={count} $gap={gap}>
      {buckets.map((bucket, index) => (
        <Bar
          key={bucket.from}
          $active={activeIndex === index}
          $color={severityColor(bucketSeverity(bucket, severity), colors)}
          onMouseEnter={() => onEnter(lane, index)}
        />
      ))}
    </Bars>
  )
})

type Props = {
  // The segments, read by the visual's outcome (visualOutcome.ts).
  read: StateSegments
  visual: VisualConfig
  // What a click on a lane writes (undefined: nothing), and the click.
  pickLiteral?: (pick: Pick) => string | undefined
  onSelect?: (pick: Pick) => void
}

export const UptimeBars = ({ read, visual, pickLiteral, onSelect }: Props) => {
  const { color: colors } = useTheme()
  const [ref, scrollElement, width] = useWidth()
  const [hover, setHover] = useState<{ lane: string; index: number } | null>(
    null,
  )
  const enterBar = useCallback(
    (lane: string, index: number) =>
      setHover((previous) =>
        previous?.lane === lane && previous.index === index
          ? previous
          : { lane, index },
      ),
    [],
  )
  const lanesRef = useRef<HTMLDivElement>(null)
  const laneNames = read.lanes
  const windowLanes = laneNames.length > 50
  const virtual = useVirtualizer({
    count: laneNames.length,
    enabled: windowLanes,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => laneNames[index],
    estimateSize: () => 95,
    scrollMargin: lanesRef.current?.offsetTop ?? 36,
    overscan: 3,
  })
  const visible = windowLanes
    ? virtual.getVirtualItems().map(({ index, start }) => ({
        index,
        offset: start - virtual.options.scrollMargin,
      }))
    : laneNames.map((_, index) => ({ index, offset: undefined }))
  const barsWidth = Math.max(width - 32, 0)
  const count = Math.max(
    10,
    Math.min(
      visual.buckets ?? DEFAULT_BUCKETS,
      Math.floor(barsWidth / MIN_SLOT_PX) || DEFAULT_BUCKETS,
    ),
  )
  const firstVisibleLane = visible[0]?.index ?? 0
  const lastVisibleLane = visible.at(-1)?.index ?? -1
  const segmentsByLane = useMemo(() => {
    const grouped = new Map<string, Segment[]>()
    for (const segment of read.segments) {
      const lane = grouped.get(segment.lane)
      if (lane) lane.push(segment)
      else grouped.set(segment.lane, [segment])
    }
    return grouped
  }, [read])
  const lanes = useMemo(() => {
    const names = read.lanes.slice(firstVisibleLane, lastVisibleLane + 1)
    return bucketLanes(
      {
        ...read,
        lanes: names,
        segments: names.flatMap((name) => segmentsByLane.get(name) ?? []),
      },
      count,
    )
  }, [read, count, firstVisibleLane, lastVisibleLane, segmentsByLane])
  const severity = visual.severity
  const uptimes = useMemo(
    () => uptimeByLane(read.segments, severity),
    [read, severity],
  )
  const current = useMemo(() => latestStateByLane(read.segments), [read])
  // A lane is drawn from all of its rows, by its lane column; a click on it
  // selects only when they agree, so it is a button only then.
  const clickableLanes = useMemo(() => {
    const out = new Map<string, Pick>()
    if (!pickLiteral) return out
    for (const [lane, rows] of read.laneRows) {
      const pick = pickOf(0, rows, read.laneColumn)
      if (pickLiteral(pick) !== undefined) out.set(lane, pick)
    }
    return out
  }, [read, pickLiteral])
  const counts = { bad: 0, warning: 0, neutral: 0, good: 0 }
  for (const state of current.values()) counts[severityOf(state, severity)]++
  const overallSeverity = counts.bad
    ? "bad"
    : counts.warning
      ? "warning"
      : counts.neutral
        ? "neutral"
        : "good"
  const overallText =
    [
      counts.bad ? `${counts.bad} down` : "",
      counts.warning ? `${counts.warning} degraded` : "",
      counts.neutral ? `${counts.neutral} neutral` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "All operational"
  const span = spanLabel(read.to - read.from)
  const slot = barsWidth / count
  const gap = Math.max(1, Math.min(3, Math.round(slot * 0.4)))
  const nearNow = Date.now() - read.to < (read.to - read.from) / count + 60_000

  return (
    <Root ref={ref} data-hook="uptime-bars">
      <Summary>
        <Overall
          $color={severityColor(overallSeverity, colors)}
          $labelColor={severityTextColor(overallSeverity, colors)}
        >
          {overallText}
        </Overall>
        <span>Uptime over the last {span}</span>
      </Summary>
      <Lanes
        ref={lanesRef}
        style={windowLanes ? { height: virtual.getTotalSize() } : undefined}
      >
        {visible.map(({ index: laneIndex, offset }) => {
          const lane = laneNames[laneIndex]
          const buckets = lanes.get(lane) ?? []
          const uptime = uptimes.get(lane) ?? null
          const state = current.get(lane) ?? ""
          const active = hover?.lane === lane ? buckets[hover.index] : null
          const left =
            hover?.lane === lane
              ? Math.min(
                  Math.max(hover.index * slot - 120, 0),
                  Math.max(barsWidth - 260, 0),
                )
              : 0
          const pick = clickableLanes.get(lane)
          const activate = onSelect && pick ? () => onSelect(pick) : undefined
          return (
            <Lane
              key={lane}
              data-lane-index={laneIndex}
              data-index={laneIndex}
              ref={windowLanes ? virtual.measureElement : undefined}
              style={
                offset === undefined
                  ? undefined
                  : { position: "absolute", top: offset, width: "100%" }
              }
              $clickable={Boolean(activate)}
              role={activate ? "button" : undefined}
              tabIndex={activate ? 0 : undefined}
              onClick={activate}
              onKeyDown={
                activate &&
                ((event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  activate()
                })
              }
              onMouseEnter={placeCard}
              onMouseLeave={() => setHover(null)}
            >
              <Head>
                <Name>{lane}</Name>
                <Current
                  $color={severityTextColor(
                    severityOf(state, severity),
                    colors,
                  )}
                >
                  {capitalise(state)}
                </Current>
              </Head>
              <LaneBars
                lane={lane}
                buckets={buckets}
                count={count}
                gap={gap}
                activeIndex={hover?.lane === lane ? hover.index : null}
                severity={severity}
                onEnter={enterBar}
              />
              <Foot>
                <span>{span} ago</span>
                <hr />
                <span>
                  {uptime === null
                    ? "No data"
                    : `${(uptime * 100).toFixed(uptime === 1 ? 0 : 2)} % uptime`}
                </span>
                <hr />
                <span>{nearNow ? "Now" : MOMENT.format(read.to)}</span>
              </Foot>
              {active && (
                <Card style={{ left }}>
                  <b>{bucketTitle(active)}</b>
                  <BucketDetail bucket={active} visual={visual} />
                </Card>
              )}
            </Lane>
          )
        })}
      </Lanes>
    </Root>
  )
}

const BucketDetail = ({
  bucket,
  visual,
}: {
  bucket: Bucket
  visual: VisualConfig
}) => {
  const { color: colors } = useTheme()
  const entries = [...bucket.time.entries()]
    .filter(([, ms]) => ms > 0)
    .map(([state, ms]) => ({
      state,
      ms,
      severity: severityOf(state, visual.severity),
    }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.ms - a.ms,
    )
  if (entries.length === 0) return <p>No data recorded.</p>
  const down = entries.some((e) => e.severity === "bad")
  return (
    <>
      {!down && <p>No downtime recorded.</p>}
      <ul style={down ? undefined : { marginTop: "0.6rem" }}>
        {entries.map((e) => (
          <li key={e.state}>
            <Dot $color={severityColor(e.severity, colors)} />
            <span>{e.state}</span>
            <span>{formatDuration(e.ms)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
