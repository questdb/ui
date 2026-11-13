import type { NotebookOnboarding } from "../providers/LocalStorageProvider/types"
import type { ConsoleConfig } from "../providers/SettingsProvider/types"
import { hasExampleDashboards } from "./examples/hasExampleDashboards"

// A deployment that ships example dashboards is a showcase: the dashboards
// introduce notebooks far better than the modal would, so it stays away.
export const shouldShowNotebookModal = (
  onboarding: NotebookOnboarding,
  consoleConfig: Pick<ConsoleConfig, "exampleDashboards"> = {},
): boolean =>
  !hasExampleDashboards(consoleConfig) &&
  onboarding.mcpEverConnected !== true &&
  onboarding.showNotebookPromo !== false

// Same rule for the in-notebook MCP promo: not on showcase deployments.
export const shouldShowMcpPromo = (
  onboarding: NotebookOnboarding,
  consoleConfig: Pick<ConsoleConfig, "exampleDashboards"> = {},
): boolean =>
  !hasExampleDashboards(consoleConfig) &&
  onboarding.mcpEverConnected !== true &&
  onboarding.showMcpPromo !== false

export const isMcpPromoCollapsed = (onboarding: NotebookOnboarding): boolean =>
  onboarding.collapseMcpPromo === true
