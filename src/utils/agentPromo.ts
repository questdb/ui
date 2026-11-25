import { getValue, setValue } from "./localStorage"
import { StoreKey } from "./localStorage/types"
import { readPendingPair } from "./mcp/mcpBridgeStorage"

// The agent promo shows once per browser, to everyone who has not seen it:
// it has its own key, so the notebook onboarding it replaces does not hide it.

export const shouldShowAgentPromo = (): boolean =>
  getValue(StoreKey.AGENT_PROMO_SEEN) !== "true"

export const markAgentPromoSeen = (): void =>
  setValue(StoreKey.AGENT_PROMO_SEEN, "true")

// Not over a pairing link: the user came to connect an agent, and the consent
// dialog asks for that.
export const hasPendingPair = (): boolean =>
  readPendingPair() !== null ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mcp-pair") === "1")
