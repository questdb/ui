import type { Table, MaterializedView } from "../../../utils/questdb/types"

export type HealthSeverity = "critical" | "warning" | "healthy" | "recovering"

export type TrendDirection = "increasing" | "decreasing" | "stable"

export type HealthIssue = {
  id: string
  severity: HealthSeverity
  field: string
  message: string
}

export type TrendIndicator = {
  field: string
  direction: TrendDirection
  rate: number
  message: string
}

export type HealthStatus = {
  overallSeverity: HealthSeverity
  issues: HealthIssue[]
  fieldIssues: Map<string, HealthIssue>
  trendIndicators: Map<string, TrendIndicator>
}

export type TimestampedSample = {
  value: number
  timestamp: number
}

export type TrendData = {
  walPendingRowCount: TimestampedSample[]
  transactionLag: TimestampedSample[]
  ingestionMetric: TimestampedSample[]
}

const TREND_WINDOW_MS = 30_000
export const MAX_TREND_SAMPLES = 150
const RATE_THRESHOLD = 0.5

function getRecentSamples(
  samples: TimestampedSample[],
  now: number = Date.now(),
): TimestampedSample[] {
  const cutoff = now - TREND_WINDOW_MS
  return samples.filter((s) => s.timestamp >= cutoff)
}

export function calculateTrendRate(
  samples: TimestampedSample[],
  now: number = Date.now(),
): number {
  const recent = getRecentSamples(samples, now)
  if (recent.length < 2) return 0

  const first = recent[0].timestamp
  const points = recent.map((s) => ({
    t: (s.timestamp - first) / 1000,
    v: s.value,
  }))

  const n = points.length
  const avgT = points.reduce((sum, p) => sum + p.t, 0) / n
  const avgV = points.reduce((sum, p) => sum + p.v, 0) / n

  let numerator = 0
  let denominator = 0

  for (const p of points) {
    numerator += (p.t - avgT) * (p.v - avgV)
    denominator += (p.t - avgT) ** 2
  }

  return denominator === 0 ? 0 : numerator / denominator
}

export function getTrendDirection(rate: number): TrendDirection {
  if (rate > RATE_THRESHOLD) return "increasing"
  if (rate < -RATE_THRESHOLD) return "decreasing"
  return "stable"
}

export function detectIngestionActive(samples: TimestampedSample[]): boolean {
  if (samples.length < 2) return false
  const recent = samples.slice(-5).map((s) => s.value)
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] > recent[i - 1]) return true
  }
  return false
}

export function calculateHealthStatus(
  tableData: Table,
  matViewData: MaterializedView | null,
  trendData: TrendData,
  isMatView: boolean,
): HealthStatus {
  const issues: HealthIssue[] = []

  // ============================================================
  // RED (Critical) - Immediate attention required
  // ============================================================

  // R1: WAL Suspended (affects header dot only, UI has dedicated section)
  if (tableData.walEnabled && tableData.table_suspended) {
    issues.push({
      id: "R1",
      severity: "critical",
      field: "walStatus",
      message: "WAL suspended - ingestion blocked",
    })
  }

  // R2: MatView Invalid (affects header dot only, UI has dedicated section)
  if (isMatView && matViewData?.view_status === "invalid") {
    issues.push({
      id: "R2",
      severity: "critical",
      field: "viewStatus",
      message: "Materialized view is invalid",
    })
  }

  // R3: Memory Backoff (level 2)
  if (tableData.table_memory_pressure_level === 2) {
    issues.push({
      id: "R3",
      severity: "critical",
      field: "memoryPressure",
      message: "Memory backoff - system under pressure",
    })
  }

  // ============================================================
  // YELLOW (Warning) - Needs attention
  // ============================================================

  // Trend indicators using linear regression (rate per second)
  const trendIndicators = new Map<string, TrendIndicator>()

  if (tableData.walEnabled) {
    const txLagRate = calculateTrendRate(trendData.transactionLag)
    const pendingRate = calculateTrendRate(trendData.walPendingRowCount)

    const txLagDirection = getTrendDirection(txLagRate)
    const pendingDirection = getTrendDirection(pendingRate)

    const currentLag =
      trendData.transactionLag[trendData.transactionLag.length - 1]?.value ?? 0
    const currentPending =
      trendData.walPendingRowCount[trendData.walPendingRowCount.length - 1]
        ?.value ?? 0

    if (currentLag > 0 && txLagDirection !== "stable") {
      trendIndicators.set("transactionLag", {
        field: "transactionLag",
        direction: txLagDirection,
        rate: txLagRate,
        message:
          txLagDirection === "increasing"
            ? "WAL lag growing"
            : "WAL catching up",
      })
    }

    if (currentPending > 0 && pendingDirection !== "stable") {
      trendIndicators.set("pendingRows", {
        field: "pendingRows",
        direction: pendingDirection,
        rate: pendingRate,
        message:
          pendingDirection === "increasing"
            ? "Pending rows accumulating"
            : "Pending rows clearing",
      })
    }

    // Y3: Small Transactions (p90 < 100 rows, but > 0 to exclude empty tables)
    if (
      tableData.wal_tx_size_p90 !== null &&
      tableData.wal_tx_size_p90 > 0 &&
      tableData.wal_tx_size_p90 < 100
    ) {
      issues.push({
        id: "Y3",
        severity: "warning",
        field: "txSizeP90",
        message: "Small transactions - consider batching",
      })
    }

    // Y4: High Write Amplification (p50 > 2.0 means significant O3 merge overhead)
    if (
      tableData.table_write_amp_p50 !== null &&
      tableData.table_write_amp_p50 > 2.0
    ) {
      issues.push({
        id: "Y4",
        severity: "warning",
        field: "writeAmp",
        message: "High write amplification (O3 overhead)",
      })
    }

    // Y5: Reduced Parallelism (memory pressure level 1)
    if (tableData.table_memory_pressure_level === 1) {
      issues.push({
        id: "Y5",
        severity: "warning",
        field: "memoryPressure",
        message: "Reduced parallelism mode",
      })
    }
  }

  // Build field -> issue map (highest severity wins per field)
  const fieldIssues = new Map<string, HealthIssue>()
  const severityOrder: Record<HealthSeverity, number> = {
    critical: 0,
    warning: 1,
    recovering: 2,
    healthy: 3,
  }

  for (const issue of issues) {
    const existing = fieldIssues.get(issue.field)
    if (
      !existing ||
      severityOrder[issue.severity] < severityOrder[existing.severity]
    ) {
      fieldIssues.set(issue.field, issue)
    }
  }

  let overallSeverity: HealthSeverity = "healthy"
  if (issues.some((i) => i.severity === "critical")) {
    overallSeverity = "critical"
  } else if (issues.some((i) => i.severity === "warning")) {
    overallSeverity = "warning"
  } else if (issues.some((i) => i.severity === "recovering")) {
    overallSeverity = "recovering"
  }

  return { overallSeverity, issues, fieldIssues, trendIndicators }
}
