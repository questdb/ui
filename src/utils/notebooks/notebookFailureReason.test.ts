import { describe, expect, it } from "vitest"
import { NotebookToolError } from "./notebookToolError"
import { notebookFailureReason } from "./notebookFailureReason"
import { SessionEndedError } from "../../modules/OAuth2/session"

describe("notebook failure reasons", () => {
  it("only sends controlled reason codes, never error content or arbitrary names", () => {
    expect(
      notebookFailureReason(
        new NotebookToolError("deleted", "private notebook"),
      ),
    ).toBe("deleted")
    expect(
      notebookFailureReason(
        new DOMException("private data", "QuotaExceededError"),
      ),
    ).toBe("storage_quota")
    expect(notebookFailureReason(new SessionEndedError())).toBe(
      "authentication",
    )
    expect(
      notebookFailureReason({
        name: "private table",
        message: "select private",
      }),
    ).toBe("unexpected")
    expect(notebookFailureReason(new Error("private query"))).toBe("unexpected")
  })
})
