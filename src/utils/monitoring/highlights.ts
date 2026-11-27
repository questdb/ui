import type {
  HighlightConfig,
  HighlightRule,
  HighlightColorToken,
} from "../../components/ResultGrid/highlight/types"

const rule = (column: string, color: HighlightColorToken) => ({
  id: crypto.randomUUID(),
  enabled: true,
  target: { kind: "column" as const, name: column },
  appliesTo: "cell" as const,
  display: "always" as const,
  color,
})

const trends = (columns: string[]): HighlightRule[] =>
  columns.flatMap((column) =>
    (["gt", "lt"] as const).map((op) => ({
      ...rule(column, "dataSeries9"),
      kind: "previous" as const,
      display: "temporary" as const,
      condition: { op },
    })),
  )

// Server status texts, matched regardless of case, so a server that changes
// how it capitalises a state still gets highlighted.
const status = (columns: string[]): HighlightRule[] =>
  columns.flatMap((column) => [
    {
      ...rule(column, "dataNegative"),
      kind: "value" as const,
      condition: {
        op: "matches" as const,
        pattern: "(?i)^(suspended|invalid|failed|backoff)$",
      },
    },
    {
      ...rule(column, "dataSeries3"),
      kind: "value" as const,
      condition: {
        op: "matches" as const,
        // `retrying`: a view refresh deferred after a transient error.
        pattern: "(?i)^(unknown|reduced parallelism|refreshing|retrying)$",
      },
    },
  ])

export const healthHighlights = (
  identity: string,
  statuses: string[],
  changing: string[],
): HighlightConfig => ({
  identityColumns: [identity],
  rules: [...status(statuses), ...trends(changing)],
})

export const partitionHighlights = (diskColumn: string): HighlightConfig => ({
  identityColumns: ["Partition"],
  rules: [
    {
      id: crypto.randomUUID(),
      enabled: true,
      kind: "newRow",
      color: "dataSeries9",
      display: "temporary",
    },
    {
      ...rule("State", "dataSeries2"),
      kind: "value",
      condition: { op: "eq", value: "Active" },
    },
    {
      ...rule(diskColumn, "dataSeries9"),
      kind: "value",
      condition: {
        op: "between",
        from: null,
        to: null,
        fill: { kind: "gradient", highColor: "dataSeries6" },
      },
    },
    ...trends(["Rows", diskColumn, "Dead rows", "Pieces"]),
  ],
})

export const downstreamHighlights = (): HighlightConfig => ({
  identityColumns: ["View"],
  rules: [
    ...status(["Status"]),
    ...trends(["Pending txns"]),
    {
      ...rule("Last refresh (UTC)", "dataSeries9"),
      kind: "previous",
      display: "temporary",
      condition: { op: "changed" },
    },
  ],
})

// View refresh incidents: a failure or invalidation highlights its row.
export const incidentHighlights = (counts: boolean): HighlightConfig => ({
  identityColumns: counts ? ["Event"] : ["Time (UTC)", "Event"],
  rules: [
    {
      ...rule(counts ? "Signal" : "Event", "dataNegative"),
      kind: "value",
      appliesTo: "row",
      condition: {
        op: "matches",
        pattern: counts ? "^Review$" : "^(View invalidated|Refresh failed)$",
      },
    },
    ...(counts ? trends(["Count"]) : []),
  ],
})
