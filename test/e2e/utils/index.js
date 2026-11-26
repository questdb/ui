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

// Runs the console's SQL over HTTP only, never over QWP.
const seedSqlOverHttp = (win) => {
  win.localStorage.setItem("feature.qwp", "false")
}

module.exports = {
  ctrlOrCmd,
  escapeRegExp,
  NOTEBOOK_ONBOARDING_KEY,
  seedNotebookOnboarding,
  seedSqlOverHttp,
}
