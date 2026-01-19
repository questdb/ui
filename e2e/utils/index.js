const ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}"

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

module.exports = {
  ctrlOrCmd,
  escapeRegExp,
}
