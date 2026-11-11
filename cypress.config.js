const { defineConfig } = require("cypress");

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || "";
const baseUrl = `http://localhost:9999${contextPath}`;

module.exports = defineConfig({
  defaultCommandTimeout: 10000,
  e2e: {
    testIsolation: false,
    defaultCommandTimeout: 10000,
    screenshotOnRunFailure: true,
    screenshotsFolder: "test/e2e/screenshots",
    videosFolder: "test/e2e/videos",
    video: false,
    fixturesFolder: "test/e2e/fixtures",
    downloadsFolder: "test/e2e/downloads",
    baseUrl: baseUrl,
    chromeWebSecurity: false, //if it is true, cypress does not allow redirects
    viewportWidth: 1920,
    viewportHeight: 1080,
    specPattern: "test/e2e/**/*.spec.js",
    supportFile: "test/e2e/commands.js",
    setupNodeEvents(on) {
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
