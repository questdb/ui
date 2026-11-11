// @vitest-environment jsdom
import React from "react"
import { describe, it, expect, vi } from "vitest"
import { renderComponent } from "../test/component"
import type { NotebookVariable } from "../store/notebook"
import { executeSingleRaw } from "../utils/executeSingleRaw"
import { useQueryExecution } from "./useQueryExecution"

vi.mock("../utils/executeSingleRaw", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/executeSingleRaw")>()),
  executeSingleRaw: vi.fn(),
}))

describe("useQueryExecution", () => {
  it("declares variables added after the last render", async () => {
    // Given a hook rendered while the notebook had no variables
    let variables: NotebookVariable[] = []
    const probe: {
      executeSingle?: ReturnType<typeof useQueryExecution>["executeSingle"]
    } = {}
    const Probe = () => {
      probe.executeSingle = useQueryExecution(() => variables).executeSingle
      return null
    }
    renderComponent(<Probe />)

    // When a paste adds a variable and runs the cell before the next render
    variables = [{ name: "x", value: "1" }]
    await probe.executeSingle?.("SELECT @x")

    // Then the query is sent with the new variable
    expect(vi.mocked(executeSingleRaw).mock.calls[0][2]).toEqual([
      { name: "x", value: "1" },
    ])
  })
})
