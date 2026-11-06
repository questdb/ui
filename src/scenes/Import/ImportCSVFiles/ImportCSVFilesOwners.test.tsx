// @vitest-environment jsdom
import {
  renderComponent,
  getHook,
  findHook,
  queryHook,
  requestUrl,
} from "../../../test/component"
import React from "react"
import { readFileSync } from "node:fs"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import rootReducer from "../../../store/reducers"
import { ImportCSVFiles } from "."
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import { questClient } from "../../../utils/questdb/queryClient"

// Viewport visibility is outside these upload-owner checks.
vi.mock("../../../hooks/useIsVisible", () => ({ useIsVisible: () => true }))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
const hook = (name: string) => getHook(`import-${name}`)
const csv = readFileSync("test/e2e/fixtures/test.csv", "utf8")
const groups = {
  columns: [{ name: "group", type: "STRING" }],
  dataset: [["analysts"], ["research"]],
  count: 2,
}

beforeEach(() => {
  questClient.resetCredentials()
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window & typeof globalThis }
  }
  vi.stubGlobal("File", jsdom.window.File)
  vi.stubGlobal("Blob", jsdom.window.Blob)
  vi.stubGlobal("FormData", jsdom.window.FormData)
})
afterEach(() => authSessionState.endSession())

const mountImport = async ({
  release = "EE",
  sso = false,
  delayedOwners = false,
} = {}) => {
  localStorage.setItem("RELEASE_TYPE", release)
  if (sso)
    authSessionState.setAuthPayload({
      access_token: "owner-fixture-token",
      token_type: "Bearer",
    })
  else authSessionState.markNonSSOAuthenticated()
  const ownerQueries: string[] = []
  let resolveOwners!: (response: Response) => void
  const pendingOwners = new Promise<Response>((resolve) => {
    resolveOwners = resolve
  })
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      const sql = url.searchParams.get("query")
      if (url.pathname === "/chk")
        return Promise.resolve(Response.json({ status: "Does not exist" }))
      if (sql === "select current_user()") {
        ownerQueries.push(sql)
        return Promise.resolve(
          Response.json({
            columns: [{ name: "current_user", type: "STRING" }],
            dataset: [["admin"]],
            count: 1,
          }),
        )
      }
      if (sql === "show groups 'admin'") {
        ownerQueries.push(sql)
        return delayedOwners
          ? pendingOwners
          : Promise.resolve(Response.json(groups))
      }
      if (sql?.includes("cairo.sql.copy.root"))
        return Promise.resolve(
          Response.json({
            columns: [{ name: "value", type: "STRING" }],
            dataset: [[null]],
            count: 1,
          }),
        )
      throw new Error(`Unexpected request: ${requestUrl(input).href}`)
    }),
  )
  const uploads: { url: URL; body: FormData }[] = []
  class UploadRequest {
    status = 200
    response = JSON.stringify({
      status: "OK",
      location: "test.csv",
      header: true,
      rowsImported: 2,
      rowsRejected: 0,
      columns: [{ name: "date", type: "TIMESTAMP", size: 8, errors: 0 }],
    })
    url!: URL
    upload = { addEventListener: vi.fn() }
    onload = () => {}
    open(_method: string, url: string) {
      this.url = new URL(url, location.href)
    }
    setRequestHeader() {}
    abort() {}
    send(body: FormData) {
      uploads.push({ url: this.url, body })
      queueMicrotask(() => this.onload())
    }
  }
  vi.stubGlobal("XMLHttpRequest", UploadRequest)
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <ImportCSVFiles onViewData={vi.fn()} onUpload={vi.fn()} />
    </Provider>,
  )
  await findHook("import-browse-from-disk")
  if (release === "EE")
    await waitFor(() => expect(ownerQueries).toContain("show groups 'admin'"))
  return {
    uploads,
    ownerQueries,
    resolveOwners: async () => {
      await act(async () => {
        resolveOwners(Response.json(groups))
        await pendingOwners
      })
    },
  }
}
const queueFile = async () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(
    input,
    new File([csv], "test.csv", { type: "text/csv" }),
  )
  await findHook("import-table-column-schema")
}
const uploadAs = async (
  server: Awaited<ReturnType<typeof mountImport>>,
  owner: string,
) => {
  const count = server.uploads.length
  expect(hook("table-owner-select")).toHaveTextContent(owner)
  await userEvent.click(hook("upload-button"))
  await waitFor(() => expect(server.uploads).toHaveLength(count + 1))
  const upload = server.uploads[count]
  expect(upload.url.searchParams.get("owner")).toBe(owner)
  expect(upload.url.searchParams.get("name")).toBe("test.csv")
  expect(upload.body.get("data")).toBeInstanceOf(File)
  expect((upload.body.get("data") as File).size).toBe(new Blob([csv]).size)
  await waitFor(() =>
    expect(hook("file-status")).toHaveTextContent("Imported 2 rows"),
  )
}

describe("CSV import owners", () => {
  it("uploads as the displayed password user, then the selected group", async () => {
    // Given
    const server = await mountImport()
    await queueFile()
    await userEvent.click(hook("table-owner-select"))
    for (const name of ["admin", "analysts", "research"])
      expect(screen.getByRole("menuitemradio", { name })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    // When / Then
    await uploadAs(server, "admin")
    await userEvent.click(hook("table-owner-select"))
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "analysts" }),
    )
    await uploadAs(server, "analysts")
  })

  it("excludes the SSO username and uploads as the first group", async () => {
    // Given
    const server = await mountImport({ sso: true })
    await queueFile()

    // When
    await userEvent.click(hook("table-owner-select"))

    // Then
    expect(
      screen.queryByRole("menuitemradio", { name: "admin" }),
    ).not.toBeInTheDocument()
    for (const name of ["analysts", "research"])
      expect(screen.getByRole("menuitemradio", { name })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await uploadAs(server, "analysts")
  })

  it.each([false, true])(
    "keeps the submitted owner equal to the displayed owner after a delayed lookup (SSO=%s)",
    async (sso) => {
      // Given
      const server = await mountImport({ sso, delayedOwners: true })
      await queueFile()
      expect(queryHook("import-table-column-owner")).not.toBeInTheDocument()

      // When
      await server.resolveOwners()

      // Then
      await findHook("import-table-column-owner")
      await uploadAs(server, sso ? "analysts" : "admin")
    },
  )

  it("uploads in OSS without owner controls or owner lookups", async () => {
    // Given
    const server = await mountImport({ release: "OSS" })
    await queueFile()
    expect(queryHook("import-table-column-owner")).not.toBeInTheDocument()
    expect(queryHook("import-table-owner-select")).not.toBeInTheDocument()

    // When
    await userEvent.click(hook("upload-button"))

    // Then
    await waitFor(() => expect(server.uploads).toHaveLength(1))
    await waitFor(() =>
      expect(hook("file-status")).toHaveTextContent("Imported 2 rows"),
    )
    expect(server.ownerQueries).toEqual([])
  })
})
