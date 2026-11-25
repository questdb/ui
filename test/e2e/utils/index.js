const ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}"

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const NOTEBOOK_ONBOARDING_KEY = "notebook.onboarding"

const NOTEBOOK_ONBOARDING_SUPPRESSED = JSON.stringify({
  mcpEverConnected: true,
})

// The agent promo opens on load until it has been seen.
const AGENT_PROMO_SEEN_KEY = "ai.agentPromo.seen"

const seedNotebookOnboarding = (win) => {
  if (!win.localStorage.getItem(NOTEBOOK_ONBOARDING_KEY)) {
    win.localStorage.setItem(
      NOTEBOOK_ONBOARDING_KEY,
      NOTEBOOK_ONBOARDING_SUPPRESSED,
    )
  }
  if (!win.localStorage.getItem(AGENT_PROMO_SEEN_KEY)) {
    win.localStorage.setItem(AGENT_PROMO_SEEN_KEY, "true")
  }
}

module.exports = {
  ctrlOrCmd,
  escapeRegExp,
  NOTEBOOK_ONBOARDING_KEY,
  AGENT_PROMO_SEEN_KEY,
  seedNotebookOnboarding,
}
