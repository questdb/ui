import type { Buffer } from "../../store/buffers"
import { isMonitoringDashboard } from "../monitoring/identity"

// Configured example ids can match built-in monitoring template ids.
export const exampleTemplateIdOf = (
  buffer: Buffer | undefined,
): string | undefined =>
  buffer && !isMonitoringDashboard(buffer) ? buffer.templateId : undefined
