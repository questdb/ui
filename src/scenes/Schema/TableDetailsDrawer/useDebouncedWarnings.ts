import { useRef, useMemo } from "react"
import type { HealthStatus, HealthSeverity } from "./healthCheck"

export const DEBOUNCE_DELAY_MS = 5_000

export const DEBOUNCE_ISSUE_IDS = new Set(["Y1", "Y2"])

export const ISSUE_TO_TREND_KEY: Record<string, string> = {
  Y1: "transactionLag",
  Y2: "pendingRows",
}

export function applyDebounceFilter(
  rawHealthStatus: HealthStatus,
  confirmedIds: Set<string>,
): HealthStatus {
  const currentIssueIds = new Set(
    rawHealthStatus.issues
      .filter((i) => DEBOUNCE_ISSUE_IDS.has(i.id))
      .map((i) => i.id),
  )

  if (confirmedIds.size === currentIssueIds.size) {
    return rawHealthStatus
  }

  const filteredIssues = rawHealthStatus.issues.filter(
    (issue) => !DEBOUNCE_ISSUE_IDS.has(issue.id) || confirmedIds.has(issue.id),
  )

  const adjustedTrends = new Map(rawHealthStatus.trendIndicators)
  for (const [issueId, trendKey] of Object.entries(ISSUE_TO_TREND_KEY)) {
    if (!confirmedIds.has(issueId)) {
      const trend = adjustedTrends.get(trendKey)
      if (trend && trend.direction !== "decreasing") {
        adjustedTrends.delete(trendKey)
      }
    }
  }

  const fieldIssues = new Map(rawHealthStatus.fieldIssues)
  for (const issue of rawHealthStatus.issues) {
    if (DEBOUNCE_ISSUE_IDS.has(issue.id) && !confirmedIds.has(issue.id)) {
      fieldIssues.delete(issue.field)
    }
  }

  let overallSeverity: HealthSeverity = "healthy"
  if (filteredIssues.some((i) => i.severity === "critical")) {
    overallSeverity = "critical"
  } else if (filteredIssues.some((i) => i.severity === "warning")) {
    overallSeverity = "warning"
  } else if (filteredIssues.some((i) => i.severity === "recovering")) {
    overallSeverity = "recovering"
  }

  return {
    overallSeverity,
    issues: filteredIssues,
    fieldIssues,
    trendIndicators: adjustedTrends,
  }
}

export function updateFirstSeen(
  firstSeen: Map<string, number>,
  rawHealthStatus: HealthStatus,
  now: number,
): Set<string> {
  const currentIssueIds = new Set(
    rawHealthStatus.issues
      .filter((i) => DEBOUNCE_ISSUE_IDS.has(i.id))
      .map((i) => i.id),
  )

  for (const id of firstSeen.keys()) {
    if (!currentIssueIds.has(id)) {
      firstSeen.delete(id)
    }
  }

  const confirmedIds = new Set<string>()
  for (const id of currentIssueIds) {
    const seen = firstSeen.get(id)
    if (seen === undefined) {
      firstSeen.set(id, now)
    } else if (now - seen >= DEBOUNCE_DELAY_MS) {
      confirmedIds.add(id)
    }
  }

  return confirmedIds
}

export function useDebouncedWarnings(
  rawHealthStatus: HealthStatus | null,
): HealthStatus | null {
  const firstSeenRef = useRef<Map<string, number>>(new Map())

  return useMemo(() => {
    if (!rawHealthStatus) {
      firstSeenRef.current.clear()
      return null
    }

    const confirmedIds = updateFirstSeen(
      firstSeenRef.current,
      rawHealthStatus,
      Date.now(),
    )

    return applyDebounceFilter(rawHealthStatus, confirmedIds)
  }, [rawHealthStatus])
}
