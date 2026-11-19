import type { Buffer } from "../../store/buffers"
import type { MonitoringKind, MonitoringTarget } from "./types"

// Kept apart from the templates (dashboard.ts), which load only when a
// dashboard is created.

const TEMPLATE_PREFIX = "monitoring:"

// A dashboard's `templateId` names its template, not its table: it is sent
// with template telemetry, which carries no table names. The table is in
// `Buffer.monitoring`.
export const monitoringTemplateId = (kind: MonitoringKind): string =>
  `${TEMPLATE_PREFIX}${kind}`

export const isMonitoringTemplateId = (templateId: string | undefined) =>
  templateId !== undefined && templateId.startsWith(TEMPLATE_PREFIX)

// An open, unedited dashboard: it still has its template's id.
export const isMonitoringDashboard = (buffer: Buffer): boolean =>
  isMonitoringTemplateId(buffer.templateId) && buffer.monitoring !== undefined

// QuestDB table names are unique regardless of case, so opens of one table
// under any case share a lock. Reuse also requires the exact name: the
// dashboard SQL matches it case-sensitively.
export const monitoringTargetKey = (target: MonitoringTarget): string =>
  JSON.stringify([target.kind, target.name.toLowerCase()])
