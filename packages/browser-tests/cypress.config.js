const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:9999",
    viewportWidth: 1280,
    viewportHeight: 720,
    supportFile: "cypress/commands.js",
    specPattern: "**/*.spec.js",
    setupNodeEvents(on, config) {
      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (browser.family === "chromium" && browser.name !== "electron") {
          launchOptions.args.push(
            "--high-dpi-support=1",
            "--force-device-scale-factor=1"
          );
        }

        return launchOptions;
      });
    },
  },
});
