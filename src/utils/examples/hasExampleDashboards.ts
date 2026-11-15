import type {
  ConsoleConfig,
  ExampleDashboard,
} from "../../providers/SettingsProvider/types"

// The one switch for the showcase behaviour (demo deployments): a non-empty
// `exampleDashboards` list in console-configuration.json. Anything else
// (missing, null, not an array, empty) means a regular console.
export const hasExampleDashboards = (
  consoleConfig: Pick<ConsoleConfig, "exampleDashboards"> | undefined,
): consoleConfig is { exampleDashboards: ExampleDashboard[] } =>
  Array.isArray(consoleConfig?.exampleDashboards) &&
  consoleConfig.exampleDashboards.length > 0
