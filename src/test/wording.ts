// Product wording guard: the console never names the protocols or the
// MCP server; it says "your agent" (or "coding agent" in a first explanation) or the agent's name.
export const NEVER_SAID = /MCP|WebSocket|bridge|pair|token|ACP|deep link/i

// An element's text without the package name inside commands, which is a
// real identifier the user types, not the product's wording.
export const wordingOf = (element: Element): string =>
  (element.textContent ?? "").replaceAll("@questdb/mcp-server-questdb", "")
