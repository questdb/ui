import { describe, it, expect } from "vitest"
import { ALL_DEFINITIONS, aiTools } from "./tools"

type SchemaNode = {
  type?: unknown
  description?: string
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

// Every reference_lines property in the catalog, by its path.
const collectReferenceLines = (
  path: string,
  node: SchemaNode | undefined,
  out: [string, SchemaNode][],
): void => {
  if (!node || typeof node !== "object") return
  if (node.items) collectReferenceLines(`${path}.items`, node.items, out)
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (key === "reference_lines") out.push([`${path}.${key}`, child])
    collectReferenceLines(`${path}.${key}`, child, out)
  }
}

describe("reference_lines descriptions", () => {
  // The rule the chart settings, the tools' validation and the renderer
  // follow (ChartSettingsDrawer.test.tsx checks all three against it).
  const AXIS_RULE =
    "A line goes on the left axis unless axis:'right'. A right line needs an enabled query on the right axis, or the call is refused. A line on an axis with no series (say, its query returned no rows) is not drawn; a left line moves to the right axis only when no enabled query is on the left."

  it("state the axis rule the chart follows in every tool", () => {
    // Given
    const found: [string, SchemaNode][] = []
    for (const tool of ALL_DEFINITIONS)
      collectReferenceLines(tool.name, tool.inputSchema as SchemaNode, found)

    // Then
    expect(found.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        "set_cell_chart_config.reference_lines",
        "apply_notebook_state.cells.items.chart_config.reference_lines",
      ]),
    )
    for (const [, node] of found) expect(node.description).toContain(AXIS_RULE)
  })
})
