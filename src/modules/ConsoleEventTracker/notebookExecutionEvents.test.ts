import { describe, expect, it } from "vitest"
import { notebookRunOutcome } from "./notebookExecutionEvents"
import type { CellRunOutcome } from "../../scenes/Editor/Notebook/notebookUtils"
import { denyReasonFailClosedClassify } from "../../utils/tools/permissions"

const completed: CellRunOutcome = {
  ok: true,
  superseded: false,
  result: {
    activeResultIndex: 0,
    timestamp: 0,
    results: [{ type: "ddl", query: "private SQL" }],
  },
}
describe("notebook execution outcomes", () => {
  it("requires an attributable run result to call an execution successful", () => {
    expect(notebookRunOutcome(completed)).toBe("success")
    expect(notebookRunOutcome({ ...completed, ok: false })).toBe("error")
    expect(notebookRunOutcome({ ...completed, result: undefined })).toBe(
      "not_started",
    )
    expect(notebookRunOutcome({ ...completed, superseded: true })).toBe(
      "superseded",
    )
    expect(notebookRunOutcome({ ...completed, cellChanged: true })).toBe(
      "unverified",
    )
    expect(notebookRunOutcome({ ...completed, resultCleared: true })).toBe(
      "unverified",
    )
    expect(notebookRunOutcome({ ...completed, cancelled: "cancelled" })).toBe(
      "cancelled",
    )
    expect(notebookRunOutcome({ ...completed, denied: "private denial" })).toBe(
      "denied",
    )
    expect(notebookRunOutcome({ ...completed, skipped: "write" })).toBe(
      "skipped",
    )
  })

  // The same vocabulary as the refresh engine: a validate outage is not a
  // permission denial.
  it("labels a run refused because its SQL could not be classified", () => {
    expect(
      notebookRunOutcome({
        ...completed,
        denied: denyReasonFailClosedClassify("execution", "network down"),
        deniedCode: "classify_failed",
      }),
    ).toBe("validation_failed")
  })
})
