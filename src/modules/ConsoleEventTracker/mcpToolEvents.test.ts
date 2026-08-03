import { describe, expect, it } from "vitest"
import { ConsoleEvent } from "./events"
import {
  applyNotebookStateLayoutMode,
  classifyToolResult,
  mcpToolCallEvent,
  permissionLevelOf,
} from "./mcpToolEvents"
import {
  INVALID_BUFFER_ID_MESSAGE,
  STATE_NOT_FETCHED_MESSAGE,
  STATE_STALE_MESSAGE,
} from "../../utils/notebooks/notebookToolMessages"
import {
  denyReasonFailClosedClassify,
  denyReasonForDrawWrite,
  denyReasonForSchemaTool,
  denyReasonForWriteSql,
} from "../../utils/tools/permissions"
import { mcpTools } from "../../utils/tools/tools"

const textResult = (text: string, isError = true) => ({
  content: [{ type: "text", text }],
  isError,
})

describe("mcpToolCallEvent", () => {
  it("maps known tool names to their enum member", () => {
    expect(mcpToolCallEvent("add_cell")).toBe(ConsoleEvent.MCP_ADD_CELL)
    expect(mcpToolCallEvent("apply_notebook_state")).toBe(
      ConsoleEvent.MCP_APPLY_NOTEBOOK_STATE,
    )
    expect(mcpToolCallEvent("get_workspace_state")).toBe(
      ConsoleEvent.MCP_GET_WORKSPACE_STATE,
    )
    expect(mcpToolCallEvent("get_recent_user_actions")).toBe(
      ConsoleEvent.MCP_GET_RECENT_USER_ACTIONS,
    )
  })

  it("maps every advertised MCP tool", () => {
    expect(
      mcpTools
        .map((tool) => tool.name)
        .filter((name) => mcpToolCallEvent(name) === null),
    ).toEqual([])
  })

  it("does not treat MCP lifecycle events as tool calls", () => {
    expect(mcpToolCallEvent("connected")).toBeNull()
    expect(mcpToolCallEvent("pairing_accepted")).toBeNull()
    expect(mcpToolCallEvent("unknown_tool")).toBeNull()
  })

  it("returns null for unmapped tool names", () => {
    expect(mcpToolCallEvent("brand_new_tool")).toBeNull()
    expect(mcpToolCallEvent("")).toBeNull()
  })
})

describe("classifyToolResult", () => {
  it("classifies success", () => {
    expect(classifyToolResult(textResult('{"ok":true}', false))).toEqual({
      outcome: "ok",
    })
  })

  it("classifies generic tool errors", () => {
    expect(classifyToolResult(textResult("something broke"))).toEqual({
      outcome: "tool_error",
    })
  })

  it("classifies schema-access denials", () => {
    expect(
      classifyToolResult(textResult(denyReasonForSchemaTool("get_tables"))),
    ).toEqual({
      outcome: "denied",
      reasonCode: "schema_access",
    })
  })

  it("classifies write-SQL denials", () => {
    expect(
      classifyToolResult(textResult(denyReasonForWriteSql("INSERT"))),
    ).toEqual({
      outcome: "denied",
      reasonCode: "write_sql",
    })
  })

  it("classifies draw-write refusals", () => {
    expect(
      classifyToolResult(textResult(denyReasonForDrawWrite("INSERT"))),
    ).toEqual({
      outcome: "denied",
      reasonCode: "draw_write",
    })
  })

  it("classifies fail-closed draw classification refusals", () => {
    expect(
      classifyToolResult(
        textResult(denyReasonFailClosedClassify("draw", "request timed out")),
      ),
    ).toEqual({
      outcome: "denied",
      reasonCode: "classify_failed",
    })
  })

  it("classifies fail-closed execution classification as a generic denial", () => {
    expect(
      classifyToolResult(
        textResult(
          denyReasonFailClosedClassify("execution", "request timed out"),
        ),
      ),
    ).toEqual({ outcome: "denied" })
  })

  it("classifies other PERMISSION_DENIED messages without a reasonCode", () => {
    const result = textResult(
      "PERMISSION_DENIED: this SQL needs the 'read' permission to execute.",
    )
    expect(classifyToolResult(result)).toEqual({ outcome: "denied" })
  })

  it("classifies freshness-gate denials, including with an appended digest block", () => {
    expect(classifyToolResult(textResult(STATE_STALE_MESSAGE))).toEqual({
      outcome: "denied",
      reasonCode: "stale",
    })
    expect(classifyToolResult(textResult(STATE_NOT_FETCHED_MESSAGE))).toEqual({
      outcome: "denied",
      reasonCode: "not_fetched",
    })
    expect(
      classifyToolResult(
        textResult(
          `${INVALID_BUFFER_ID_MESSAGE}\n\n<since_last_check>\n  active_buffer: { id: 3 }\n</since_last_check>`,
        ),
      ),
    ).toEqual({ outcome: "denied", reasonCode: "invalid_buffer_id" })
  })

  it("never treats a stale JSON tool error as a gate denial", () => {
    const result = textResult(
      JSON.stringify({
        error_code: "stale",
        message: "STATE_STALE: mid-apply",
      }),
    )
    expect(classifyToolResult(result)).toEqual({ outcome: "tool_error" })
  })
})

describe("applyNotebookStateLayoutMode", () => {
  it("extracts a valid layout_mode from the tool input", () => {
    expect(applyNotebookStateLayoutMode({ layout_mode: "grid" })).toEqual({
      layoutMode: "grid",
    })
    expect(applyNotebookStateLayoutMode({ layout_mode: "list" })).toEqual({
      layoutMode: "list",
    })
  })

  it("returns an empty payload when absent or invalid", () => {
    expect(applyNotebookStateLayoutMode({ buffer_id: 1 })).toEqual({})
    expect(applyNotebookStateLayoutMode({ layout_mode: "weird" })).toEqual({})
    expect(applyNotebookStateLayoutMode(undefined)).toEqual({})
    expect(applyNotebookStateLayoutMode(null)).toEqual({})
  })
})

describe("permissionLevelOf", () => {
  it("encodes the permission hierarchy", () => {
    expect(
      permissionLevelOf({ grantSchemaAccess: true, read: true, write: true }),
    ).toBe("write")
    expect(
      permissionLevelOf({ grantSchemaAccess: true, read: true, write: false }),
    ).toBe("read")
    expect(
      permissionLevelOf({ grantSchemaAccess: true, read: false, write: false }),
    ).toBe("schema")
    expect(
      permissionLevelOf({
        grantSchemaAccess: false,
        read: false,
        write: false,
      }),
    ).toBe("none")
  })
})
