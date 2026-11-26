import "../../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it } from "vitest"
import { isQwpEnabled, qwpEgressUrl } from "."
import { StoreKey } from "../../localStorage/types"

afterEach(() => {
  localStorage.clear()
})

describe("qwpEgressUrl", () => {
  it.each([
    ["http://localhost:9000/", "ws://localhost:9000/read/v1"],
    ["https://db.example.com/", "wss://db.example.com/read/v1"],
    [
      "https://db.example.com/ci/console/",
      "wss://db.example.com/ci/console/read/v1",
    ],
    ["http://localhost:9999/index.html", "ws://localhost:9999/read/v1"],
  ])("opens connections from %s at %s", (base, url) => {
    expect(qwpEgressUrl(base).toString()).toBe(url)
  })
})

describe("isQwpEnabled", () => {
  it("is on unless this browser turned it off", () => {
    expect(isQwpEnabled()).toBe(true)
    localStorage.setItem(StoreKey.USE_QWP, "false")
    expect(isQwpEnabled()).toBe(false)
    localStorage.setItem(StoreKey.USE_QWP, "true")
    expect(isQwpEnabled()).toBe(true)
  })
})
