import { describe, expect, it } from "vitest"
import type { NotebookSettings } from "../../../../store/notebook"
import {
  assertNotebookVariablesUnchanged,
  VariablesUpdatedError,
  type VariableApplyBaseline,
} from "./variableApplyConflict"

const baseline: VariableApplyBaseline = {
  localVariables: [{ name: "desk", kind: "expression", value: "1" }],
  timeRange: { from: "2025-01-01", to: "2025-01-02" },
  globalRevision: 3,
}

describe("assertNotebookVariablesUnchanged", () => {
  it("accepts the opening variable context", () => {
    // Given the variable context captured when the dialog opened.
    const settings: NotebookSettings = {
      variables: baseline.localVariables,
      timeRange: baseline.timeRange,
    }

    // When the commit guard checks the current context.
    const check = () => assertNotebookVariablesUnchanged(settings, baseline)

    // Then the unchanged context remains valid.
    expect(check).not.toThrow()
  })

  it.each([
    {
      name: "local variables",
      settings: {
        variables: [{ name: "desk", kind: "expression", value: "2" }],
        timeRange: baseline.timeRange,
      } satisfies NotebookSettings,
    },
    {
      name: "time range",
      settings: {
        variables: baseline.localVariables,
        timeRange: { from: "2025-01-03", to: "2025-01-04" },
      } satisfies NotebookSettings,
    },
  ])("rejects changed $name", ({ settings }) => {
    // Given a variable context that changed after the dialog opened.

    // When the commit guard checks the current context.
    const check = () => assertNotebookVariablesUnchanged(settings, baseline)

    // Then the complete dialog apply is rejected.
    expect(check).toThrow(VariablesUpdatedError)
  })
})
