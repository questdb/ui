import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { Client } from "./client"
import {
  AuthRefreshUnavailableError,
  SessionEndedError,
} from "../../modules/OAuth2/session"

const commonHeaders = {
  Authorization: "Bearer retained-credentials",
  "X-Other": "keep",
}
const installToken = (generation: string, groupsEncoded: boolean) => {
  authSessionState.setAuthPayload({
    access_token: `${generation}-access`,
    id_token: `${generation}-id`,
    token_type: "Bearer",
    groups_encoded_in_token: groupsEncoded,
  })
}

const fetchRequests = [
  {
    name: "validateQuery",
    url: "api/v1/sql/validate?query=select%201",
    body: { query: "select 1", columns: [], timestamp: 0 },
    run: (client: Client) => client.validateQuery("select 1"),
  },
  {
    name: "checkCSVFile",
    url: "chk?",
    body: { status: "Exists" },
    run: (client: Client) => client.checkCSVFile("probe.csv"),
  },
  {
    name: "savePreferences",
    url: "settings?version=1",
    body: {},
    run: (client: Client) =>
      client.savePreferences({ version: 1, instance_name: "Test" }),
  },
]

const mockUploadRequests = (autoComplete = true, sendError?: Error) => {
  const requests: UploadRequest[] = []
  class UploadRequest {
    status = 200
    statusText = "Upload failed"
    response = JSON.stringify({
      columns: [],
      header: true,
      location: "probe",
      rowsImported: 1,
      rowsRejected: 0,
      status: "OK",
    })
    upload = { addEventListener: vi.fn() }
    open = vi.fn()
    setRequestHeader = vi.fn()
    onload?: () => void
    onerror?: () => void
    onabort?: () => void
    ontimeout?: () => void
    send = vi.fn(() => {
      if (sendError) throw sendError
      if (autoComplete) this.onload?.()
    })

    constructor() {
      requests.push(this)
    }
  }
  vi.stubGlobal("XMLHttpRequest", UploadRequest)
  return requests
}

const upload = (client: Client) =>
  client.uploadCSVFile({
    file: new File(["value\n1\n"], "probe.csv", { type: "text/csv" }),
    name: "probe",
    owner: "admin",
    onProgress: vi.fn(),
  })

const expectUploadHeaders = (
  request: ReturnType<typeof mockUploadRequests>[number],
  authorization: string,
) => {
  expect(request.open).toHaveBeenCalledWith(
    "POST",
    expect.stringContaining("imp?"),
  )
  expect(request.setRequestHeader.mock.calls).toEqual(
    expect.arrayContaining([
      ["Authorization", authorization],
      ["X-Other", "keep"],
    ]),
  )
  expect(request.setRequestHeader).toHaveBeenCalledTimes(2)
  expect(request.send).toHaveBeenCalledWith(expect.any(FormData))
}

afterEach(() => {
  authSessionState.endSession()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each([
  { name: "access token", groupsEncoded: false, suffix: "access" },
  { name: "ID token", groupsEncoded: true, suffix: "id" },
])(
  "non-SQL send-time authorization using the $name",
  ({ groupsEncoded, suffix }) => {
    it.each(fetchRequests)(
      "$name sends the installed bearer after rotation and preserves other headers",
      async ({ url, body, run }) => {
        const fetchMock = vi.fn(() =>
          Promise.resolve(new Response(JSON.stringify(body))),
        )
        vi.stubGlobal("fetch", fetchMock)
        const client = new Client()
        client.setCommonHeaders(commonHeaders)
        installToken("initial", groupsEncoded)
        await run(client)
        // AuthProvider installs a renewed payload before React updates the
        // client's common headers. Every entrypoint must read that new payload.
        installToken("rotated", groupsEncoded)
        await run(client)

        for (const [index, generation] of ["initial", "rotated"].entries()) {
          expect(fetchMock).toHaveBeenNthCalledWith(
            index + 1,
            expect.stringContaining(url),
            expect.objectContaining({
              headers: {
                Authorization: `Bearer ${generation}-${suffix}`,
                "X-Other": "keep",
              },
            }),
          )
        }
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(commonHeaders.Authorization).toBe("Bearer retained-credentials")
      },
    )

    it("uploadCSVFile sets the installed bearer on each XHR after rotation", async () => {
      const requests = mockUploadRequests()
      const client = new Client()
      client.setCommonHeaders(commonHeaders)
      installToken("initial", groupsEncoded)
      await expect(upload(client)).resolves.toMatchObject({ status: "OK" })
      installToken("rotated", groupsEncoded)
      await expect(upload(client)).resolves.toMatchObject({ status: "OK" })

      expect(requests).toHaveLength(2)
      expectUploadHeaders(requests[0], `Bearer initial-${suffix}`)
      expectUploadHeaders(requests[1], `Bearer rotated-${suffix}`)
      expect(commonHeaders.Authorization).toBe("Bearer retained-credentials")
    })
  },
)

describe("non-SQL refresh coordination", () => {
  it.each([...fetchRequests, { name: "uploadCSVFile", run: upload }])(
    "$name waits for renewal and sends only the fresh bearer",
    async ({ run }) => {
      const requests = mockUploadRequests()
      const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")))
      vi.stubGlobal("fetch", fetchMock)
      authSessionState.setAuthPayload({
        access_token: "expired",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_at: new Date(Date.now() - 1).toISOString(),
      })
      const client = new Client()
      let finish!: () => void
      client.refreshTokenMethod = () =>
        new Promise((resolve) => {
          finish = () => {
            const payload = {
              access_token: "fresh",
              token_type: "Bearer",
              expires_at: new Date(Date.now() + 300_000).toISOString(),
            }
            authSessionState.setAuthPayload(payload)
            resolve(payload)
          }
        })
      const pending = run(client)
      await Promise.resolve()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(requests).toHaveLength(0)
      finish()
      await pending
      if (requests.length) {
        expect(requests[0].setRequestHeader).toHaveBeenCalledWith(
          "Authorization",
          "Bearer fresh",
        )
      } else {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: { Authorization: "Bearer fresh" },
          }),
        )
      }
    },
  )
})

const operations = [...fetchRequests, { name: "uploadCSVFile", run: upload }]
const installExpired = () =>
  authSessionState.setAuthPayload({
    access_token: "expired",
    refresh_token: "refresh",
    token_type: "Bearer",
    expires_at: new Date(Date.now() - 1).toISOString(),
  })

describe("non-SQL auth rejection branches", () => {
  it.each(operations)(
    "$name rejects unavailable renewal without sending a request",
    async ({ run }) => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const requests = mockUploadRequests()
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      installExpired()
      const client = new Client()
      client.refreshTokenMethod = vi.fn(() =>
        Promise.reject(new Error("IdP unavailable")),
      )
      await expect(run(client)).rejects.toBeInstanceOf(
        AuthRefreshUnavailableError,
      )
      expect(fetchMock).not.toHaveBeenCalled()
      expect(requests).toHaveLength(0)
      expect(authSessionState.isAuthenticated()).toBe(true)
      expect(client.hasActiveRequests()).toBe(false)
    },
  )

  it.each(operations)(
    "$name rejects a session end while waiting and never sends under the new login",
    async ({ run }) => {
      const requests = mockUploadRequests()
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      installExpired()
      const client = new Client()
      client.refreshTokenMethod = () => new Promise(() => {})
      const rejected = expect(run(client)).rejects.toBeInstanceOf(
        SessionEndedError,
      )
      await Promise.resolve()
      authSessionState.endSession()
      authSessionState.markNonSSOAuthenticated()
      await rejected
      expect(fetchMock).not.toHaveBeenCalled()
      expect(requests).toHaveLength(0)
      expect(client.hasActiveRequests()).toBe(false)
    },
  )

  it.each(operations)(
    "$name rejects a response from the previous login",
    async ({ name, run }) => {
      const requests = mockUploadRequests(false)
      let finish!: (response: Response) => void
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve
            }),
        ),
      )
      installToken("initial", false)
      const rejected = expect(run(new Client())).rejects.toBeInstanceOf(
        SessionEndedError,
      )
      await Promise.resolve()
      await Promise.resolve()
      authSessionState.endSession()
      authSessionState.markNonSSOAuthenticated()
      if (name === "uploadCSVFile") requests[0].onload!()
      else finish(new Response("{}"))
      await rejected
    },
  )

  it("validateQuery respects cancellation before and during a refresh wait", async () => {
    installExpired()
    const client = new Client()
    client.refreshTokenMethod = () => new Promise(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const signal = new AbortController()
    const rejected = expect(
      client.validateQuery("select 1", signal.signal),
    ).rejects.toMatchObject({ name: "AbortError" })
    signal.abort()
    await rejected
    await expect(
      client.validateQuery("select 1", signal.signal),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("preferences write activity tracking", () => {
  it.each(["success", "HTTP error", "invalid error body", "old session"])(
    "tracks a pending write and clears it after %s",
    async (outcome) => {
      authSessionState.markNonSSOAuthenticated()
      let finish!: (response: Response) => void
      const fetchMock = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      )
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      const pending = client
        .savePreferences({ version: 1, instance_name: "Test" })
        .catch((error: unknown) => error)
      expect(client.hasActiveRequests()).toBe(true)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      if (outcome === "old session") authSessionState.endSession()
      finish(
        outcome === "HTTP error"
          ? new Response("Write failed", { status: 500 })
          : outcome === "invalid error body"
            ? new Response("not JSON", {
                status: 500,
                statusText: "Server error",
                headers: { "Content-Type": "application/json" },
              })
            : new Response("{}"),
      )
      const result = await pending
      expect(client.hasActiveRequests()).toBe(false)
      if (outcome === "old session") {
        expect(result).toBeInstanceOf(SessionEndedError)
      } else {
        expect(result).toMatchObject({ success: outcome === "success" })
      }
    },
  )

  it.each(["synchronous throw", "network rejection"])(
    "clears activity after a %s",
    async (outcome) => {
      authSessionState.markNonSSOAuthenticated()
      const error = new Error("Network failure")
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          if (outcome === "synchronous throw") throw error
          return Promise.reject(error)
        }),
      )
      const client = new Client()
      await expect(client.savePreferences({ version: 1 })).rejects.toBe(error)
      expect(client.hasActiveRequests()).toBe(false)
    },
  )

  it("counts overlapping writes independently", async () => {
    authSessionState.markNonSSOAuthenticated()
    const finish: ((response: Response) => void)[] = []
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => finish.push(resolve)),
    )
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    const first = client.savePreferences({ version: 1 })
    const second = client.savePreferences({ version: 1 })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    finish[0](new Response("{}"))
    await first
    expect(client.hasActiveRequests()).toBe(true)
    finish[1](new Response("{}"))
    await second
    expect(client.hasActiveRequests()).toBe(false)
  })

  it("keeps activity while reading an error response, including after logout", async () => {
    authSessionState.markNonSSOAuthenticated()
    let finish!: (body: string) => void
    const text = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          headers: new Headers(),
          text,
        }),
      ),
    )
    const client = new Client()
    const pending = client.savePreferences({ version: 1 })
    const rejected = expect(pending).rejects.toBeInstanceOf(SessionEndedError)
    await vi.waitFor(() => expect(text).toHaveBeenCalledOnce())
    expect(client.hasActiveRequests()).toBe(true)
    authSessionState.endSession()
    expect(client.hasActiveRequests()).toBe(true)
    finish("Write failed")
    await rejected
    expect(client.hasActiveRequests()).toBe(false)
  })
})

describe("upload activity tracking", () => {
  it.each([
    "success",
    "HTTP error",
    "network error",
    "abort",
    "timeout",
    "invalid JSON",
    "old session",
  ])("tracks a pending upload and clears it after %s", async (outcome) => {
    authSessionState.markNonSSOAuthenticated()
    const requests = mockUploadRequests(false)
    const client = new Client()
    const finished = upload(client).catch((error: unknown) => error)
    await Promise.resolve()
    await Promise.resolve()
    expect(requests).toHaveLength(1)
    expect(client.hasActiveRequests()).toBe(true)
    const request = requests[0]
    if (outcome === "HTTP error") request.status = 500
    if (outcome === "invalid JSON") request.response = "not JSON"
    if (outcome === "old session") authSessionState.endSession()
    if (outcome === "network error") request.onerror!()
    else if (outcome === "abort") request.onabort!()
    else if (outcome === "timeout") request.ontimeout!()
    else request.onload!()
    const result = await finished
    if (outcome === "old session")
      expect(result).toBeInstanceOf(SessionEndedError)
    if (outcome === "invalid JSON") expect(result).toBeInstanceOf(SyntaxError)
    expect(client.hasActiveRequests()).toBe(false)
  })

  it("clears activity when sending throws synchronously", async () => {
    authSessionState.markNonSSOAuthenticated()
    const error = new Error("Could not send")
    mockUploadRequests(false, error)
    const client = new Client()
    await expect(upload(client)).rejects.toBe(error)
    expect(client.hasActiveRequests()).toBe(false)
  })

  it("keeps concurrent uploads active until all have settled", async () => {
    authSessionState.markNonSSOAuthenticated()
    const requests = mockUploadRequests(false)
    const client = new Client()
    const first = upload(client)
    const second = upload(client)
    await Promise.resolve()
    await Promise.resolve()
    expect(client.hasActiveRequests()).toBe(true)
    requests[0].onload!()
    await first
    expect(client.hasActiveRequests()).toBe(true)
    requests[1].onload!()
    await second
    expect(client.hasActiveRequests()).toBe(false)
  })
})

describe("non-SQL authorization outside SSO", () => {
  it.each(fetchRequests)("$name preserves common headers", async ({ run }) => {
    authSessionState.markNonSSOAuthenticated()
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")))
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders(commonHeaders)

    await run(client)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: commonHeaders }),
    )
  })

  it("uploadCSVFile preserves common headers", async () => {
    authSessionState.markNonSSOAuthenticated()
    const requests = mockUploadRequests()
    const client = new Client()
    client.setCommonHeaders(commonHeaders)

    await upload(client)

    expect(requests).toHaveLength(1)
    expectUploadHeaders(requests[0], commonHeaders.Authorization)
  })
})
