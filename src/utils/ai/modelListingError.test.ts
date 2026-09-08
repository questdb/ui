import { describe, expect, it } from "vitest"
import { getModelListingErrorMessage } from "./modelListingError"
import type { AiAssistantAPIError } from "./aiAssistant"

const classified = (
  type: AiAssistantAPIError["type"] = "unknown",
): AiAssistantAPIError => ({ type, message: "Provider error" })

describe("getModelListingErrorMessage", () => {
  it.each([
    [401, "Invalid API key"],
    [403, "This API key does not have permission to list models"],
    [404, "This provider does not support model listing"],
    [405, "This provider does not support model listing"],
    [429, "The provider rate limit was reached"],
    [500, "The provider is temporarily unavailable"],
    [503, "The provider is temporarily unavailable"],
  ])("maps HTTP %s to a specific message", (status, expected) => {
    expect(getModelListingErrorMessage({ status }, classified())).toContain(
      expected,
    )
  })

  it("describes connection failures without claiming validation succeeded", () => {
    expect(
      getModelListingErrorMessage(
        new Error("fetch failed"),
        classified("network"),
      ),
    ).toBe(
      "Could not reach the provider. Check its URL and your network connection.",
    )
  })

  it("preserves the provider message for other failures", () => {
    expect(
      getModelListingErrorMessage(
        { status: 422 },
        { type: "unknown", message: "Unsupported request" },
      ),
    ).toBe("Unsupported request")
  })
})
