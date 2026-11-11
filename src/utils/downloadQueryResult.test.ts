// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { downloadQueryResult } from "./downloadQueryResult"
import { API_VERSION } from "../consts"
import { toast } from "../components/Toast"

vi.mock("../components/Toast", () => ({ toast: { error: vi.fn() } }))

afterEach(() => {
  document.body.replaceChildren()
  history.replaceState(null, "", "/")
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("downloadQueryResult", () => {
  it.each(["/", "/console/"])(
    "preserves SQL characters and export parameters beneath %s",
    (path) => {
      // Given
      history.replaceState(null, "", path)
      vi.spyOn(Date, "now").mockReturnValue(123456789)
      const query =
        "select 'İstanbul & Zürich + 50% #?' as \"city name\";\nselect 2"

      // When
      downloadQueryResult(query, "parquet")

      // Then
      const frame = document.querySelector("iframe")!
      const url = new URL(frame.src)
      expect(url.pathname).toBe(`${path}exp`)
      expect(url.searchParams.get("query")).toBe(query)
      expect(url.searchParams.get("version")).toBe(String(API_VERSION))
      expect(url.searchParams.get("filename")).toBe("questdb-query-123456789")
      expect(url.searchParams.get("fmt")).toBe("parquet")
      expect(url.searchParams.get("rmode")).toBe("nodelay")
    },
  )

  it("uses CSV parameters without Parquet's response mode", () => {
    // Given
    const query = "select x from long_sequence(10)"

    // When
    downloadQueryResult(query, "csv")

    // Then
    const url = new URL(document.querySelector("iframe")!.src)
    expect(url.searchParams.get("query")).toBe(query)
    expect(url.searchParams.get("fmt")).toBe("csv")
    expect(url.searchParams.has("rmode")).toBe(false)
  })

  it.each([
    {
      body: '{"error":"table does not exist"}',
      message:
        "An error occurred while downloading the file: table does not exist",
    },
    {
      body: '{"status":"unavailable"}',
      message:
        'An error occurred while downloading the file: {"status":"unavailable"}',
    },
    {
      body: "Bad Gateway",
      message: "An error occurred while downloading the file: Bad Gateway",
    },
    { body: "", message: null },
  ])(
    "handles the export response $body and removes its iframe",
    ({ body, message }) => {
      // Given
      downloadQueryResult("select 1", "csv")
      const frame = document.querySelector("iframe")!
      const response = document.implementation.createHTMLDocument()
      response.body.textContent = body
      Object.defineProperty(frame, "contentDocument", { value: response })

      // When
      frame.dispatchEvent(new Event("load"))

      // Then
      if (message === null) expect(toast.error).not.toHaveBeenCalled()
      else {
        expect(toast.error).toHaveBeenCalledOnce()
        expect(toast.error).toHaveBeenCalledWith(message)
      }
      expect(document.querySelector("iframe")).toBeNull()
    },
  )

  it("reports one download failure and removes the failed iframe", () => {
    // Given
    downloadQueryResult("select 1", "csv")
    const frame = document.querySelector("iframe")!

    // When
    frame.dispatchEvent(new Event("error"))

    // Then
    expect(toast.error).toHaveBeenCalledOnce()
    expect(toast.error).toHaveBeenCalledWith(
      "An error occurred while downloading the file",
    )
    expect(document.querySelector("iframe")).toBeNull()
  })
})
