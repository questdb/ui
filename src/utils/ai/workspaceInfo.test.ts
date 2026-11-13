import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import { buildWorkspaceInfo } from "./workspaceInfo"

const buffer = (id: number, overrides: Partial<Buffer> = {}): Buffer =>
  ({ id, label: `tab-${id}`, value: "", position: id, ...overrides }) as Buffer

describe("buildWorkspaceInfo", () => {
  it("lists every tab kind, open and closed, and marks the bound notebook", () => {
    // Given one tab of each kind, one of them closed
    const sql = buffer(1, { label: "Query", editorViewState: {} as never })
    const metrics = buffer(2, {
      label: "CPU",
      metricsViewState: { metrics: [] } as never,
    })
    const notebook = buffer(3, {
      label: "Trades",
      notebookViewState: {} as never,
      archived: true,
      position: -1,
    })

    // When the workspace is built for a chat bound to the notebook
    const ws = buildWorkspaceInfo([sql, metrics, notebook], sql, 3)

    // Then all tabs appear with their kind and state
    expect(ws?.tabs).toEqual([
      { buffer_id: 1, label: "Query", kind: "sql", archived: false },
      { buffer_id: 2, label: "CPU", kind: "metrics", archived: false },
      {
        buffer_id: 3,
        label: "Trades",
        kind: "notebook",
        archived: true,
        bound_to_this_chat: true,
      },
    ])
    expect(ws?.active).toEqual({
      buffer_id: 1,
      label: "Query",
      kind: "sql",
      archived: false,
    })
  })

  it("leaves out AI preview buffers", () => {
    // Given a diff preview buffer next to a real tab
    const preview = buffer(9, { isPreviewBuffer: true })
    const sql = buffer(1)

    // When the workspace is built
    const ws = buildWorkspaceInfo([preview, sql], sql)

    // Then only the real tab is listed
    expect(ws?.tabs.map((tab) => tab.buffer_id)).toEqual([1])
  })

  it("does not report the AI preview buffer as the active tab", () => {
    // Given the diff preview buffer is the active tab
    const preview = buffer(9, { isPreviewBuffer: true })
    const sql = buffer(1)

    // When the workspace is built
    const ws = buildWorkspaceInfo([preview, sql], preview)

    // Then no active tab is reported, so the agent never learns its id
    expect(ws?.active).toBeUndefined()
    expect(ws?.tabs.map((tab) => tab.buffer_id)).toEqual([1])
  })

  it("returns nothing when there are no tabs and no active buffer", () => {
    expect(buildWorkspaceInfo([], {} as Buffer)).toBeUndefined()
  })
})
