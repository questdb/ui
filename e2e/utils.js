exports.ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}";

exports.escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
