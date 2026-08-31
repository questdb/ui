import { type Table, type LiveView } from "../../../utils/questdb/types"
import type { TableKindData } from "./types"
import { formatMicrosDuration } from "./utils"

const DOCS_BASE_URL = "https://questdb.com/docs"
const MONITORING_DOCS_URL = `${DOCS_BASE_URL}/operations/monitoring-alerting`
const LIVE_VIEWS_MONITORING_DOCS_URL = `${DOCS_BASE_URL}/concepts/live-views/#monitoring`

export const ISSUE_DOCS_URLS: Record<string, string> = {
  R1: `${MONITORING_DOCS_URL}/#detect-suspended-tables`, // WAL suspended
  R2: `${MONITORING_DOCS_URL}/#detect-invalid-materialized-views`, // MatView invalid
  R3: `${MONITORING_DOCS_URL}/#detect-memory-pressure`, // Memory backoff (level 2)
  R4: `${DOCS_BASE_URL}/concepts/views/#view-invalidation`, // View invalid
  R5: LIVE_VIEWS_MONITORING_DOCS_URL, // Live view invalid
  R6: LIVE_VIEWS_MONITORING_DOCS_URL, // Live view format version unsupported
  R7: LIVE_VIEWS_MONITORING_DOCS_URL, // Live view state unreadable
  Y1: `${MONITORING_DOCS_URL}/#detect-transaction-lag-and-pending-rows`, // Transaction lag increasing
  Y2: `${MONITORING_DOCS_URL}/#detect-transaction-lag-and-pending-rows`, // Pending rows increasing
  Y3: `${MONITORING_DOCS_URL}/#detect-small-transactions`, // Small transactions
  Y4: `${MONITORING_DOCS_URL}/#detect-high-write-amplification`, // High write amplification
  Y5: `${MONITORING_DOCS_URL}/#detect-memory-pressure`, // Reduced parallelism (level 1)
  Y7: LIVE_VIEWS_MONITORING_DOCS_URL, // Live view flush writer stalled
}

const LIVE_VIEW_ISSUE_GUIDANCE: Record<LiveViewFailure["issueId"], string> = {
  R5: "Invalidation is permanent. Save the definition with SHOW CREATE LIVE VIEW, then drop and recreate the view. RESUME WAL does not recover an invalid live view.",
  R6: "The on-disk format is not readable by this server build, usually after a binary downgrade. Restore the newer binary and restart. If the binary is correct, the file header is damaged: drop and recreate the view. The view does not refresh until this is resolved.",
  R7: "The view state files are corrupt or missing, and automatic recovery failed. A restart does not fix this. Save the definition with SHOW CREATE LIVE VIEW, then drop and recreate the view. Existing rows stay queryable but frozen.",
}

export const getLiveViewIssueGuidance = (issueId: string): string | undefined =>
  (LIVE_VIEW_ISSUE_GUIDANCE as Partial<Record<string, string>>)[issueId]

export type HealthSeverity = "critical" | "warning" | "healthy" | "recovering"

export type TrendDirection = "increasing" | "decreasing" | "stable"

export type HealthIssue = {
  id: string
  severity: HealthSeverity
  field: string
  message: string
  currentValue?: string
  promptValue?: string
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
  value: bigint
  timestamp: number
}

export type TrendData = {
  walPendingRowCount: TimestampedSample[]
  transactionLag: TimestampedSample[]
  ingestionMetric: TimestampedSample[]
}

// The drawer polls live_views() on this period for point-in-time status and
// metrics. lag_seqtxn is deliberately not trended: it is a flush-cadence
// sawtooth, and a drawer session is usually too short to observe enough flush
// cycles across QuestDB's full supported interval range.
export const LIVE_VIEW_POLL_MS = 1_000

const TREND_WINDOW_MS = 30_000
export const MAX_TREND_SAMPLES = 150
const RATE_THRESHOLD = 0.5

function getRecentSamples(
  samples: TimestampedSample[],
  now: number,
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
  const firstValue = recent[0].value
  const points = recent.map((s) => ({
    t: (s.timestamp - first) / 1000,
    // Trend rates are intentionally floating point. Source counters and their
    // subtraction stay exact until this derived value is calculated.
    v: Number(s.value - firstValue),
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

const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE_HUNDRED = BigInt(100)
const LIVE_VIEW_WRITER_STALL_WARNING_MICROS = BigInt(5_000_000)
const HIGH_WRITE_AMPLIFICATION_THRESHOLD = 3

export type LiveViewFailure = {
  issueId: "R5" | "R6" | "R7"
  message: string
}

export const getLiveViewFailure = (
  liveView: LiveView,
): LiveViewFailure | null => {
  switch (liveView.view_status) {
    case "invalid":
      return {
        issueId: "R5",
        message: liveView.invalidation_reason
          ? `Live view is invalid: ${liveView.invalidation_reason}`
          : "Live view is invalid",
      }
    case "version_unsupported":
      return {
        issueId: "R6",
        message: "Live view format is not readable by this server build",
      }
    case "state_unreadable":
      return {
        issueId: "R7",
        message: "Live view state files are unreadable",
      }
    default:
      return null
  }
}

// R6/R7 load-failure stubs report NULL for every diagnostic column; the UI
// hides the metric sections instead of rendering misleading values.
export const isLiveViewLoadFailure = (liveView: LiveView | null): boolean =>
  liveView?.view_status === "version_unsupported" ||
  liveView?.view_status === "state_unreadable"

export function calculateHealthStatus(
  tableData: Table,
  kindData: TableKindData,
  trendData: TrendData,
): HealthStatus {
  const matViewData = kindData.kind === "matview" ? kindData.matView : null
  const liveViewData = kindData.kind === "liveview" ? kindData.liveView : null
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
      message: "WAL suspended",
    })
  }

  // R2: MatView Invalid (affects header dot only, UI has dedicated section)
  if (matViewData?.view_status === "invalid") {
    issues.push({
      id: "R2",
      severity: "critical",
      field: "viewStatus",
      message: matViewData.invalidation_reason
        ? `Materialized view is invalid: ${matViewData.invalidation_reason}`
        : "Materialized view is invalid",
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

  // R5: invalid; R6/R7: failed to load at boot (stub states that never
  // refresh again). Shared with the schema tree via getLiveViewFailure.
  const liveViewFailure = liveViewData ? getLiveViewFailure(liveViewData) : null
  if (liveViewFailure) {
    issues.push({
      id: liveViewFailure.issueId,
      severity: "critical",
      field: "viewStatus",
      message: liveViewFailure.message,
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
      trendData.transactionLag[trendData.transactionLag.length - 1]?.value ??
      BIGINT_ZERO
    const currentPending =
      trendData.walPendingRowCount[trendData.walPendingRowCount.length - 1]
        ?.value ?? BIGINT_ZERO

    if (currentLag > BIGINT_ZERO && txLagDirection !== "stable") {
      trendIndicators.set("transactionLag", {
        field: "transactionLag",
        direction: txLagDirection,
        rate: txLagRate,
        message:
          txLagDirection === "increasing"
            ? "WAL lag growing"
            : "WAL catching up",
      })

      // Y1: Transaction lag increasing
      if (txLagDirection === "increasing") {
        issues.push({
          id: "Y1",
          severity: "warning",
          field: "transactionLag",
          message: "Transaction lag increasing",
          currentValue: `${currentLag.toLocaleString()} txns`,
          promptValue: `${currentLag.toString()} txns`,
        })
      }
    }

    if (currentPending > BIGINT_ZERO && pendingDirection !== "stable") {
      trendIndicators.set("pendingRows", {
        field: "pendingRows",
        direction: pendingDirection,
        rate: pendingRate,
        message:
          pendingDirection === "increasing"
            ? "Pending rows accumulating"
            : "Pending rows clearing",
      })

      // Y2: Pending rows increasing
      if (pendingDirection === "increasing") {
        issues.push({
          id: "Y2",
          severity: "warning",
          field: "pendingRows",
          message: "Pending rows accumulating",
          currentValue: `${currentPending.toLocaleString()} rows`,
          promptValue: `${currentPending.toString()} rows`,
        })
      }
    }

    // Y3: Small Transactions (p90 < 100 rows, but > 0 to exclude empty tables)
    if (
      tableData.wal_tx_size_p90 != null &&
      tableData.wal_tx_size_p90 > BIGINT_ZERO &&
      tableData.wal_tx_size_p90 < BIGINT_ONE_HUNDRED
    ) {
      issues.push({
        id: "Y3",
        severity: "warning",
        field: "txSizeP90",
        message: "Small transactions - consider batching",
        currentValue: `${tableData.wal_tx_size_p90.toLocaleString()} rows`,
      })
    }

    // Y4: High Write Amplification (p50 >= 3.0 means significant O3 merge overhead)
    if (
      tableData.table_write_amp_p50 != null &&
      tableData.table_write_amp_p50 >= HIGH_WRITE_AMPLIFICATION_THRESHOLD
    ) {
      issues.push({
        id: "Y4",
        severity: "warning",
        field: "writeAmp",
        message: "High write amplification (O3 overhead)",
        currentValue: `${tableData.table_write_amp_p50.toFixed(2)}x`,
      })
    }

    // Y5: Reduced Parallelism (memory pressure level 1)
    if (tableData.table_memory_pressure_level === 1) {
      issues.push({
        id: "Y5",
        severity: "warning",
        field: "memoryPressure",
        message: "Reduced parallelism mode",
        currentValue: "Level 1",
      })
    }
  }

  if (liveViewData) {
    // Y7: Flush writer stalled
    if (
      liveViewData.writer_stall_micros != null &&
      liveViewData.writer_stall_micros > LIVE_VIEW_WRITER_STALL_WARNING_MICROS
    ) {
      issues.push({
        id: "Y7",
        severity: "warning",
        field: "writerStall",
        message: "Live view flush writer stalled",
        currentValue: formatMicrosDuration(liveViewData.writer_stall_micros),
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
