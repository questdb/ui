// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { connect, mountBridge, win } from "./bridgeHarness"
import {
  useMCPBridge,
  type MCPBridgeContextValue,
} from "../../../src/providers/MCPBridgeProvider"
import { trackEvent } from "../../../src/modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../src/modules/ConsoleEventTracker/events"
import { dispatchTool } from "../../../src/utils/tools/dispatch"

vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
// Fake the operation boundary, not the MCP dispatcher or the bridge. This
// exercises freshness, response decoration, metadata extraction and transport.
vi.mock("../../../src/utils/tools/dispatch", () => ({ dispatchTool: vi.fn() }))
vi.mock("../../../src/providers/EditorProvider", () => ({
  useEditor: () => ({
    activeBuffer: {
      id: 1,
      label: "Active notebook",
      notebookViewState: { cells: [] },
    },
    buffers: [
      { id: 1, label: "Active notebook", notebookViewState: { cells: [] } },
    ],
  }),
}))
const reply = (output: unknown) => ({
  content: JSON.stringify(output),
  is_error: false,
})
const events = (name: ConsoleEvent) =>
  vi.mocked(trackEvent).mock.calls.filter(([event]) => event === name)
let bridge!: MCPBridgeContextValue
const CaptureBridge = () => {
  bridge = useMCPBridge()
  return null
}
const setup = async () => {
  await mountBridge(undefined, <CaptureBridge />)
  await connect()
}
const send = async (name: string, args: Record<string, unknown>, id = name) => {
  act(() => {
    win.__mcpFakeWS.toolCall(name, args, id)
  })
  await waitFor(() =>
    expect(
      win.__mcpFakeWS
        .framesOfType("tool_result")
        .some((result) => result.requestId === id),
    ).toBe(true),
  )
  return win.__mcpFakeWS
    .framesOfType("tool_result")
    .find((result) => result.requestId === id)!
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(dispatchTool)
    .mockReset()
    .mockResolvedValue(reply({ cells: [] }))
})

describe("MCP notebook telemetry over WebSocket", () => {
  it("joins successful tool completion to a failed SQL execution on the requested notebook", async () => {
    await setup()
    await send("get_notebook_state", { buffer_id: 42 })
    vi.mocked(dispatchTool).mockResolvedValueOnce(
      reply({
        success: false,
        results: ["error"],
        sql: "select private_data",
        error: "sensitive database error",
      }),
    )
    const response = await send("run_cell", { buffer_id: 42, cell_id: "c1" })
    expect(response.isError).toBe(false)
    // The real dispatcher decorates the response, which must not prevent
    // extraction from the original JSON or substitute active notebook 1.
    expect(JSON.stringify(response.content)).toContain("active_buffer")
    expect(events(ConsoleEvent.MCP_RUN_CELL)).toEqual([
      [
        ConsoleEvent.MCP_RUN_CELL,
        {
          notebookId: 42,
          cellId: "c1",
          executionOutcome: "error",
          outcome: "ok",
          durationMs: expect.any(Number) as number,
        },
      ],
    ])
    expect(JSON.stringify(events(ConsoleEvent.MCP_RUN_CELL))).not.toMatch(
      /private_data|sensitive/,
    )
    expect(events(ConsoleEvent.NOTEBOOK_CELL_EXECUTION)).toHaveLength(0)
  })

  it("uses the created notebook ID and preserves both IDs when duplicating", async () => {
    await setup()
    vi.mocked(dispatchTool).mockResolvedValueOnce(
      reply({ bufferId: 84, label: "Private name" }),
    )
    await send("create_notebook", { label: "Private name" })
    expect(events(ConsoleEvent.MCP_CREATE_NOTEBOOK)).toEqual([
      [
        ConsoleEvent.MCP_CREATE_NOTEBOOK,
        {
          notebookId: 84,
          outcome: "ok",
          durationMs: expect.any(Number) as number,
        },
      ],
    ])
    vi.mocked(dispatchTool).mockResolvedValueOnce(reply({ bufferId: 85 }))
    await send("duplicate_notebook", { buffer_id: 84 })
    expect(events(ConsoleEvent.MCP_DUPLICATE_NOTEBOOK)).toEqual([
      [
        ConsoleEvent.MCP_DUPLICATE_NOTEBOOK,
        {
          sourceNotebookId: 84,
          notebookId: 85,
          outcome: "ok",
          durationMs: expect.any(Number) as number,
        },
      ],
    ])
  })

  it("retains the requested notebook on a dispatch exception, but not the unresolved cell or an execution outcome", async () => {
    await setup()
    await send("get_notebook_state", { buffer_id: 42 })
    vi.mocked(dispatchTool).mockRejectedValueOnce(new Error("private failure"))
    const response = await send("run_cell", { buffer_id: 42, cell_id: "c1" })
    expect(response.isError).toBe(true)
    expect(events(ConsoleEvent.MCP_RUN_CELL)).toEqual([
      [
        ConsoleEvent.MCP_RUN_CELL,
        {
          notebookId: 42,
          outcome: "dispatch_error",
          durationMs: expect.any(Number) as number,
        },
      ],
    ])
  })

  it("reports a permission revocation mid-call as aborted with the original target", async () => {
    await setup()
    await send("get_notebook_state", { buffer_id: 42 })
    let finish!: (value: Awaited<ReturnType<typeof dispatchTool>>) => void
    vi.mocked(dispatchTool).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    act(() => {
      win.__mcpFakeWS.toolCall(
        "run_cell",
        { buffer_id: 42, cell_id: "c1" },
        "revoked",
      )
    })
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    const signal = vi.mocked(dispatchTool).mock.calls.at(-1)![6]!
    act(() =>
      bridge.setPermissions({
        grantSchemaAccess: false,
        read: false,
        write: false,
      }),
    )
    expect(signal.aborted).toBe(true)
    await act(async () => {
      finish(reply({ success: false, cancelled: true }))
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(events(ConsoleEvent.MCP_RUN_CELL)).toHaveLength(1),
    )
    expect(events(ConsoleEvent.MCP_RUN_CELL)[0][1]).toEqual({
      notebookId: 42,
      cellId: "c1",
      executionOutcome: "cancelled",
      outcome: "aborted",
      durationMs: expect.any(Number) as number,
    })
    const response = win.__mcpFakeWS
      .framesOfType("tool_result")
      .find((result) => result.requestId === "revoked")!
    expect(response.isError).toBe(true)
    expect(JSON.stringify(response.content)).toContain("PERMISSION_REVOKED")
  })

  it("does not attach the active notebook to global query events", async () => {
    await setup()
    vi.mocked(dispatchTool).mockResolvedValueOnce(reply({ success: true }))
    await send("run_query", { sql: "select 1", buffer_id: 42 })
    expect(events(ConsoleEvent.MCP_RUN_QUERY)).toEqual([
      [
        ConsoleEvent.MCP_RUN_QUERY,
        { outcome: "ok", durationMs: expect.any(Number) as number },
      ],
    ])
  })
})
