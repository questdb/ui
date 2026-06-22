import { existsSync, readFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

// The MCP tool schema is duplicated: the UI loads its own copy, and the
// mcp-bridge package loads its own. They MUST stay byte-identical — drift
// silently breaks the bridge's view of the tools. `yarn sync-tools` would
// overwrite the UI copy from `main`, so when editing on a feature branch,
// edit BOTH src copies by hand and rely on this test to catch a missed one.
const here = dirname(fileURLToPath(import.meta.url))
const uiCopy = resolve(here, "shared-definitions.json")
const bridgeCopy = resolve(
  here,
  "../../../mcp-bridge/src/consts/shared-definitions.json",
)

describe("shared-definitions.json", () => {
  it("UI and mcp-bridge copies are byte-identical", () => {
    const ui = readFileSync(uiCopy, "utf8")
    // The mcp-bridge package is not always checked out alongside the UI
    // (e.g. UI-only CI). Skip rather than fail when the sibling is absent.
    if (!existsSync(bridgeCopy)) return
    expect(readFileSync(bridgeCopy, "utf8")).toBe(ui)
  })
})
