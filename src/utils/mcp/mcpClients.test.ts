import { describe, expect, it } from "vitest"
import { mcpClientOf } from "./mcpClients"

describe("mcpClientOf", () => {
  it("names the coding agents by the name their MCP client sends", () => {
    // When
    const labels = [
      "claude-code",
      "codex-mcp-client",
      "Cursor",
      "cursor-vscode",
      "gemini-cli-mcp-client",
      "copilot-cli",
      "opencode",
      "pi",
    ].map((name) => mcpClientOf(name)?.label)

    // Then
    expect(labels).toEqual([
      "Claude Code",
      "Codex",
      "Cursor",
      "Cursor",
      "Gemini CLI",
      "GitHub Copilot",
      "OpenCode",
      "Pi",
    ])
  })

  it("suggests the agent to chat with, which can differ from the app", () => {
    // When
    const claudeDesktop = mcpClientOf("claude-ai")
    const vsCodeInsiders = mcpClientOf("Visual Studio Code - Insiders")
    const olderGemini = mcpClientOf("gemini-cli-mcp-client-questdb")

    // Then
    expect(claudeDesktop).toEqual({ label: "Claude Desktop", chatAgent: null })
    expect(vsCodeInsiders).toEqual({
      label: "VS Code",
      chatAgent: { id: "copilot", label: "GitHub Copilot" },
    })
    expect(olderGemini?.chatAgent?.id).toBe("gemini")
  })

  it("knows nothing of an unknown or missing name", () => {
    expect(mcpClientOf("some-new-agent")).toBeNull()
    expect(mcpClientOf("")).toBeNull()
    expect(mcpClientOf(null)).toBeNull()
  })

  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "knows nothing of a client named %s",
    (name) => {
      // When
      const client = mcpClientOf(name)

      // Then
      expect(client).toBeNull()
    },
  )
})
