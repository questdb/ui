import type { NotebookOnboarding } from "../providers/LocalStorageProvider/types"

export const shouldShowNotebookModal = (
  onboarding: NotebookOnboarding,
): boolean =>
  onboarding.mcpEverConnected !== true && onboarding.showNotebookPromo !== false

export const shouldShowMcpPromo = (onboarding: NotebookOnboarding): boolean =>
  onboarding.mcpEverConnected !== true && onboarding.showMcpPromo !== false

export const isMcpPromoCollapsed = (onboarding: NotebookOnboarding): boolean =>
  onboarding.collapseMcpPromo === true
