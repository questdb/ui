import type { ToolDefinition, ToolSurface } from "../ai/types"
import type { Permissions, ToolCategory } from "./permissions"
import { RUN_QUERY_MAX_LIMIT } from "./runQuery"
import sharedDefinitions from "../../consts/shared-definitions.json"

export const ALL_DEFINITIONS: ToolDefinition[] =
  sharedDefinitions as unknown as ToolDefinition[]

// Fail fast if the JSON's numeric limit drifts from RUN_QUERY_MAX_LIMIT.
const runQueryLimit = ALL_DEFINITIONS.find((d) => d.name === "run_query")
  ?.inputSchema.properties.limit as { maximum?: number } | undefined
if (runQueryLimit?.maximum !== RUN_QUERY_MAX_LIMIT) {
  throw new Error(
    `shared-definitions.json: run_query.limit.maximum (${runQueryLimit?.maximum}) ` +
      `must equal RUN_QUERY_MAX_LIMIT (${RUN_QUERY_MAX_LIMIT})`,
  )
}

const _DEF_BY_NAME = new Map(ALL_DEFINITIONS.map((d) => [d.name, d]))

export const aiTools: ToolDefinition[] = ALL_DEFINITIONS.filter((d) =>
  d.surfaces.includes("ai"),
)
export const mcpTools: ToolDefinition[] = ALL_DEFINITIONS.filter((d) =>
  d.surfaces.includes("mcp"),
)

export const categoryFor = (name: string): ToolCategory =>
  _DEF_BY_NAME.get(name)?.category ?? "free"

export const mutatesNotebook = (name: string): boolean =>
  !!_DEF_BY_NAME.get(name)?.mutatesNotebook

export const createsNotebook = (name: string): boolean =>
  !!_DEF_BY_NAME.get(name)?.createsNotebook

export const declaresBufferId = (name: string): boolean =>
  _DEF_BY_NAME.get(name)?.inputSchema.properties.buffer_id !== undefined

export const requiresFreshNotebookRead = (name: string): boolean =>
  mutatesNotebook(name) && declaresBufferId(name)

export const MCP_META_TOOL_NAMES: readonly string[] = ALL_DEFINITIONS.filter(
  (d) => d.surfaces.length === 1 && d.surfaces[0] === "mcp",
).map((d) => d.name)

export const isMcpMetaToolName = (name: string): boolean =>
  MCP_META_TOOL_NAMES.includes(name)

export const toolsForPermission = (
  perms: Permissions,
  surface: ToolSurface = "ai",
): ToolDefinition[] => {
  const base = surface === "mcp" ? mcpTools : aiTools
  if (perms.read || perms.write) return base
  if (perms.grantSchemaAccess) {
    return base.filter((t) => t.category === "free" || t.category === "schema")
  }
  return base.filter((t) => t.category === "free")
}
