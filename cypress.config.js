const { defineConfig } = require("cypress");

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || "";
const baseUrl = `http://localhost:9999${contextPath}`;

module.exports = defineConfig({
  defaultCommandTimeout: 10000,
  e2e: {
    defaultCommandTimeout: 30000,
    screenshotOnRunFailure: true,
    screenshotsFolder: "e2e/screenshots",
    videosFolder: "e2e/videos",
    video: false,
    baseUrl: baseUrl,
    chromeWebSecurity: false, //if it is true, cypress does not allow redirects
    viewportWidth: 1280,
    viewportHeight: 720,
    specPattern: "e2e/tests/**/*.spec.js",
    supportFile: "e2e/commands.js",
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
