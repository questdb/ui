import { describe, it, expect } from "vitest"
import { aiTools } from "./tools"

type SchemaNode = {
  type?: unknown
  properties?: Record<string, SchemaNode>
  required?: string[]
  additionalProperties?: unknown
  items?: SchemaNode
}

const isObjectNode = (node: SchemaNode): boolean =>
  node.type === "object" ||
  (Array.isArray(node.type) && node.type.includes("object"))

const collectViolations = (
  path: string,
  node: SchemaNode | undefined,
  out: string[],
): void => {
  if (!node || typeof node !== "object") return

  if (isObjectNode(node) && node.properties) {
    const props = Object.keys(node.properties)
    const required = node.required ?? []
    const missing = props.filter((p) => !required.includes(p))
    if (missing.length > 0) {
      out.push(`${path}: required missing [${missing.join(", ")}]`)
    }
    if (node.additionalProperties !== false) {
      out.push(`${path}: additionalProperties is not false`)
    }
  }

  if (node.items) collectViolations(`${path}.items`, node.items, out)
  for (const key of Object.keys(node.properties ?? {})) {
    collectViolations(`${path}.${key}`, node.properties![key], out)
  }
}

describe("AI tool schemas satisfy OpenAI strict mode", () => {
  it("every object node lists all properties in required and forbids extras", () => {
    const violations: string[] = []
    for (const tool of aiTools) {
      collectViolations(tool.name, tool.inputSchema as SchemaNode, violations)
    }
    expect(violations).toEqual([])
  })
})
