import { describe, expect, it } from "vitest"
import { chatErrorPartsOf } from "./chatErrorParts"

describe("chatErrorPartsOf", () => {
  it("takes a trailing command out of an error, to show it as a command", () => {
    expect(
      chatErrorPartsOf(
        "Codex is not connected. Start it again, then accept the connection: `npx @questdb/mcp-server-questdb@0.6.0 connect http://localhost:9000 --agent codex`",
      ),
    ).toEqual({
      text: "Codex is not connected. Start it again, then accept the connection:",
      command:
        "npx @questdb/mcp-server-questdb@0.6.0 connect http://localhost:9000 --agent codex",
    })
  })

  it("leaves other errors as they are, backticks included", () => {
    const error = "The query failed: `SELECT 1` is not allowed."
    expect(chatErrorPartsOf(error)).toEqual({ text: error, command: null })
  })
})
