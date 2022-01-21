/// <reference types="cypress" />
/**
 * @type {Cypress.PluginConfig}
 */
// eslint-disable-next-line no-unused-vars
module.exports = (on, config) => {
  on("before:browser:launch", (browser = {}, launchOptions) => {
    if (browser.family === "chromium" && browser.name !== "electron") {
      launchOptions.args.push(
        "--high-dpi-support=1",
        "--force-device-scale-factor=1"
      );
    }

    return launchOptions;
  });
};
