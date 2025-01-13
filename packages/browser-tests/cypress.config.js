const { defineConfig } = require("cypress");
const {
  addMatchImageSnapshotPlugin,
} = require("@simonsmith/cypress-image-snapshot/plugin");

const contextPath = process.env.QDB_HTTP_CONTEXT_PATH || ""
const baseUrl = `http://localhost:9999${contextPath}`;

module.exports = defineConfig({
  defaultCommandTimeout: 10000,
  e2e: {
    defaultCommandTimeout: 30000,
    screenshotOnRunFailure: false,
    video: false,
    baseUrl: baseUrl,
    viewportWidth: 1280,
    viewportHeight: 720,
    specPattern: "cypress/integration/**/*.spec.js",
    supportFile: "cypress/commands.js",
    setupNodeEvents(on) {
      addMatchImageSnapshotPlugin(on);

      on("before:browser:launch", (browser = {}, launchOptions) => {
        if (browser.family === "chromium" && browser.name !== "electron") {
          launchOptions.args.push(
            "--high-dpi-support=1",
            "--force-device-scale-factor=1"
          );
        }

        return launchOptions;
      });

      on("task", {
        log(message) {
          console.log(message);
          return null;
        },
      });
    },
  },
  retries: {
    runMode: 1,
  },
});
