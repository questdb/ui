const ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}"

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const NOTEBOOK_ONBOARDING_KEY = "notebook.onboarding"

const NOTEBOOK_ONBOARDING_SUPPRESSED = JSON.stringify({
  mcpEverConnected: true,
})

const seedNotebookOnboarding = (win) => {
  if (!win.localStorage.getItem(NOTEBOOK_ONBOARDING_KEY)) {
    win.localStorage.setItem(
      NOTEBOOK_ONBOARDING_KEY,
      NOTEBOOK_ONBOARDING_SUPPRESSED,
    )
  }
}

module.exports = {
  ctrlOrCmd,
  escapeRegExp,
  NOTEBOOK_ONBOARDING_KEY,
  seedNotebookOnboarding,
}
