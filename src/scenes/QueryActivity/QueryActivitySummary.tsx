import React from "react"
import { formatBytes } from "../../utils/format"
import {
  MetricCard,
  MetricLabel,
  MetricValue,
  MetricsGrid,
  Section,
} from "../Schema/TableDetailsDrawer/shared-styles"
import type { QueryActivitySummary as Summary } from "./queryActivity"

type Props = {
  summary: Summary
}

export const QueryActivitySummary = ({ summary }: Props) => (
  <Section $squishBottom>
    <MetricsGrid>
      <MetricCard data-hook="query-activity-summary-active">
        <MetricLabel>Running queries</MetricLabel>
        <MetricValue>{summary.activeCount}</MetricValue>
      </MetricCard>
      <MetricCard data-hook="query-activity-summary-memory">
        <MetricLabel>Memory in use</MetricLabel>
        <MetricValue>
          {summary.totalMemoryUsed === null
            ? "—"
            : formatBytes(summary.totalMemoryUsed)}
        </MetricValue>
      </MetricCard>
    </MetricsGrid>
  </Section>
)
