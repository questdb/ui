import type { MonitoringTarget } from "./types"

// Kept apart from the templates (dashboard.ts), which load only when a
// dashboard is created.

export const MONITORING_TEMPLATE_VERSION = 1

// QuestDB table names are unique regardless of case, so opens of one table
// under any case share a lock. Reuse also requires the exact name: the
// dashboard SQL matches it case-sensitively.
export const monitoringTargetKey = (target: MonitoringTarget): string =>
  JSON.stringify([target.instanceKey, target.kind, target.name.toLowerCase()])
