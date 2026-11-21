import React, { useEffect, useMemo, useRef, useState } from "react"
import { PaneEmptyState } from "../PaneEmptyState"
import styled, { useTheme } from "styled-components"
import type { ColorShape } from "../../../../types/styled"
import type { VisualConfig } from "../CellChart/chartTypes"
import { withAlpha } from "../../../../theme"
import type { StatementRows } from "./statementRows"
import {
  SEVERITY_RANK,
  bucketLanes,
  bucketSeverity,
  readStateSegments,
  severityOf,
  uptimeByLane,
  type Bucket,
  type Severity,
} from "./stateSegments"

// Uptime as a status page draws it: one row per lane with its current state,
// a bar per time bucket coloured by the worst state inside it, and the share
// of time up. Hovering a bar lists what happened in it.

const DEFAULT_BUCKETS = 90
const MIN_SLOT_PX = 5

const Root = styled.div`
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

const Overall = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.3rem;
  font-weight: 600;
  color: ${({ $color }) => $color};

  &::before {
    content: "";
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    box-shadow: 0 0 0 3px ${({ $color }) => withAlpha($color, 0.2)};
  }
`

const Lanes = styled.div``

const Lane = styled.div<{ $clickable: boolean }>`
  position: relative;
  padding: 1.2rem 0 1rem;
  cursor: ${({ $clickable }) => ($clickable ? "pointer" : "default")};

  & + & {
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
`

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
    case "neutral":
      return colors.chartUp
    default:
      return colors.borderDefault
  }
}

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
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

type Props = {
  visual: VisualConfig
  statements: (StatementRows | null)[]
  clickColumn?: string
  onSelect?: (value: unknown) => void
}

export const UptimeBars = ({
  visual,
  statements,
  clickColumn,
  onSelect,
}: Props) => {
  const { color: colors } = useTheme()
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<{ lane: string; index: number } | null>(
    null,
  )
  const read = useMemo(
    () => readStateSegments(visual, statements[0], clickColumn),
    [visual, statements, clickColumn],
  )
  const barsWidth = Math.max(width - 32, 0)
  const count = Math.max(
    10,
    Math.min(
      visual.buckets ?? DEFAULT_BUCKETS,
      Math.floor(barsWidth / MIN_SLOT_PX) || DEFAULT_BUCKETS,
    ),
  )
  const lanes = useMemo(
    () => (typeof read === "string" ? null : bucketLanes(read, count)),
    [read, count],
  )
  const severity = visual.severity
  const uptimes = useMemo(
    () =>
      typeof read === "string" ? null : uptimeByLane(read.segments, severity),
    [read, severity],
  )
  if (typeof read === "string") return <PaneEmptyState>{read}</PaneEmptyState>
  if (!lanes || !uptimes) return null
  const current = new Map(
    read.lanes.map((lane) => {
      const last = read.segments
        .filter((s) => s.lane === lane)
        .reduce((a, b) => (b.start >= a.start ? b : a))
      return [lane, last.state]
    }),
  )
  const counts = { bad: 0, warning: 0 }
  for (const state of current.values()) {
    const s = severityOf(state, severity)
    if (s === "bad") counts.bad++
    if (s === "warning") counts.warning++
  }
  const overall =
    counts.bad + counts.warning === 0
      ? { text: "All operational", color: colors.chartUp }
      : {
          text: [
            counts.bad > 0 ? `${counts.bad} down` : "",
            counts.warning > 0 ? `${counts.warning} degraded` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          color: counts.bad > 0 ? colors.chartDown : colors.statusWarning,
        }
  const span = spanLabel(read.to - read.from)
  const slot = barsWidth / count
  const gap = Math.max(1, Math.min(3, Math.round(slot * 0.4)))
  const nearNow = Date.now() - read.to < (read.to - read.from) / count + 60_000

  return (
    <Root ref={ref} data-hook="uptime-bars">
      <Summary>
        <Overall $color={overall.color}>{overall.text}</Overall>
        <span>Uptime over the last {span}</span>
      </Summary>
      <Lanes>
        {read.lanes.map((lane) => {
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
          const selection =
            clickColumn === undefined ? lane : read.selectionByLane?.get(lane)
          const activate =
            onSelect && selection !== undefined
              ? () => onSelect(selection)
              : undefined
          return (
            <Lane
              key={lane}
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
              onMouseLeave={() => setHover(null)}
            >
              <Head>
                <Name>{lane}</Name>
                <Current
                  $color={severityColor(severityOf(state, severity), colors)}
                >
                  {capitalise(state)}
                </Current>
              </Head>
              <Bars $count={count} $gap={gap}>
                {buckets.map((bucket, index) => (
                  <Bar
                    key={bucket.from}
                    $active={hover?.lane === lane && hover.index === index}
                    $color={severityColor(
                      bucketSeverity(bucket, severity),
                      colors,
                    )}
                    onMouseEnter={() => setHover({ lane, index })}
                  />
                ))}
              </Bars>
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
