import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { Client } from "./client"
import { tokenRefresh } from "./tokenRefresh"
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
    upload = {
      addEventListener: vi.fn<
        [string, (event: { loaded: number; total: number }) => void],
        void
      >(),
    }
    open = vi.fn()
    setRequestHeader = vi.fn()
    onload?: () => void
    onerror?: () => void
    onabort?: () => void
    ontimeout?: () => void
    abort = vi.fn(() => this.onabort?.())
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

describe("non-SQL write cancellation", () => {
  const writes = [
    { name: "uploadCSVFile", run: upload },
    {
      name: "savePreferences",
      run: (client: Client) => client.savePreferences({ version: 1 }),
    },
  ]

  it.each(writes)(
    "cancels $name during renewal without sending or cancelling the shared refresh",
    async ({ run }) => {
      installExpired()
      const requests = mockUploadRequests()
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      let finishRefresh!: () => void
      let refreshSignal: AbortSignal | undefined
      client.refreshTokenMethod = (_deadline, signal) => {
        refreshSignal = signal
        return new Promise((resolve) => {
          finishRefresh = () => {
            installToken("fresh", false)
            resolve(authSessionState.getAuthPayload()!)
          }
        })
      }
      const rejected = expect(run(client)).rejects.toMatchObject({
        name: "AbortError",
      })
      await vi.waitFor(() => expect(finishRefresh).toBeDefined())
      expect(client.hasActiveRequests()).toBe(true)
      expect(client.hasSentRequests()).toBe(false)
      client.abort()
      await rejected
      expect(client.hasActiveRequests()).toBe(false)
      expect(refreshSignal?.aborted).toBe(false)
      finishRefresh()
      await tokenRefresh.hardDeadline
      expect(fetchMock).not.toHaveBeenCalled()
      expect(requests).toHaveLength(0)
    },
  )

  it("aborts every upload, suppresses late progress and leaves a new upload active", async () => {
    installToken("initial", false)
    const requests = mockUploadRequests(false)
    const client = new Client()
    const progress = vi.fn()
    const first = client
      .uploadCSVFile({
        file: new File(["x"], "probe.csv"),
        name: "probe",
        owner: "admin",
        onProgress: progress,
      })
      .catch((error: unknown) => error)
    const second = upload(client).catch((error: unknown) => error)
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(client.hasSentRequests()).toBe(true)
    const onProgress = requests[0].upload.addEventListener.mock.calls[0][1]
    client.abort()
    client.abort()
    expect(requests[0].abort).toHaveBeenCalledOnce()
    expect(requests[1].abort).toHaveBeenCalledOnce()
    onProgress({ loaded: 1, total: 1 })
    expect(progress).not.toHaveBeenCalled()
    const next = upload(client)
    await Promise.all([first, second])
    await vi.waitFor(() => expect(requests).toHaveLength(3))
    requests[0].onload!()
    expect(client.hasActiveRequests()).toBe(true)
    expect(client.hasSentRequests()).toBe(true)
    requests[2].onload!()
    await next
    expect(client.hasActiveRequests()).toBe(false)
    expect(client.hasSentRequests()).toBe(false)
    client.abort()
    expect(requests[2].abort).not.toHaveBeenCalled()
  })

  it("cancels settings PUTs and their response bodies but not completed writes", async () => {
    installToken("initial", false)
    let signal: AbortSignal | null | undefined
    const readBody = vi.fn()
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: new Headers(),
          text: () => {
            readBody()
            return new Promise<string>((_resolve, reject) => {
              signal?.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              )
            })
          },
        })
      }),
    )
    const client = new Client()
    const rejected = expect(
      client.savePreferences({ version: 1 }),
    ).rejects.toMatchObject({ name: "AbortError" })
    await vi.waitFor(() => expect(readBody).toHaveBeenCalledOnce())
    expect(client.hasSentRequests()).toBe(true)
    client.abort()
    expect(signal?.aborted).toBe(true)
    await rejected
    expect(client.hasActiveRequests()).toBe(false)
    expect(client.hasSentRequests()).toBe(false)

    vi.mocked(fetch).mockImplementation((_url, init) => {
      signal = init?.signal
      return Promise.resolve(new Response("{}"))
    })
    await client.savePreferences({ version: 1 })
    client.abort()
    expect(signal?.aborted).toBe(false)
  })

  it("keeps independent writes running when cancelling one SQL query", async () => {
    installToken("initial", false)
    const requests = mockUploadRequests(false)
    let writeSignal: AbortSignal | null | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith("settings?")) writeSignal = init?.signal
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        })
      }),
    )
    const client = new Client()
    const uploadResult = upload(client).catch((error: unknown) => error)
    const preferencesResult = client
      .savePreferences({ version: 1 })
      .catch((error: unknown) => error)
    const { promise, queryId } = client.queryRaw("SELECT 1", {
      cancellable: true,
    })
    const queryResult = promise.catch((error: unknown) => error)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    client.abort(queryId)
    await queryResult
    expect(requests[0].abort).not.toHaveBeenCalled()
    expect(writeSignal?.aborted).toBe(false)
    expect(client.hasActiveRequests()).toBe(true)
    client.abort()
    await Promise.all([uploadResult, preferencesResult])
    expect(requests[0].abort).toHaveBeenCalledOnce()
    expect(writeSignal?.aborted).toBe(true)
    expect(client.hasActiveRequests()).toBe(false)
  })
})

describe("session end", () => {
  const endSession = (client: Client) => {
    // Mirrors the shared client's session-end listener (queryClient.ts).
    authSessionState.endSession()
    client.abortForSessionEnd()
  }

  it("lets an upload that is being sent finish and rejects its result", async () => {
    installToken("initial", false)
    const requests = mockUploadRequests(false)
    const client = new Client()
    const progress = vi.fn()
    const finished = client
      .uploadCSVFile({
        file: new File(["x"], "probe.csv"),
        name: "probe",
        owner: "admin",
        onProgress: progress,
      })
      .catch((error: unknown) => error)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(client.hasSentRequests()).toBe(true)
    expect(client.endedSessionWriteCount()).toBe(0)
    const onProgress = requests[0].upload.addEventListener.mock.calls[0][1]
    const counts: number[] = []
    client.onEndedSessionWritesChange((count) => counts.push(count))

    endSession(client)

    // Aborting mid-stream could leave a partially imported table.
    expect(requests[0].abort).not.toHaveBeenCalled()
    // The old login's upload is not the next login's activity, but it is
    // still being sent: leaving the page now would cancel it.
    expect(client.hasActiveRequests()).toBe(false)
    expect(client.hasSentRequests()).toBe(false)
    expect(client.endedSessionWriteCount()).toBe(1)
    expect(counts).toEqual([1])
    onProgress({ loaded: 1, total: 1 })
    expect(progress).not.toHaveBeenCalled()
    requests[0].onload!()
    expect(await finished).toBeInstanceOf(SessionEndedError)
    expect(requests[0].abort).not.toHaveBeenCalled()
    expect(client.endedSessionWriteCount()).toBe(0)
    expect(counts).toEqual([1, 0])
  })

  it("reports an upload that fails after its session ended as settled", async () => {
    installToken("initial", false)
    const requests = mockUploadRequests(false)
    const client = new Client()
    const finished = upload(client).catch((error: unknown) => error)
    await vi.waitFor(() => expect(requests).toHaveLength(1))

    endSession(client)
    expect(client.endedSessionWriteCount()).toBe(1)
    requests[0].onerror!()

    expect(await finished).toBeInstanceOf(SessionEndedError)
    expect(client.endedSessionWriteCount()).toBe(0)
  })

  it("lets a settings PUT that is being sent finish and rejects its result", async () => {
    installToken("initial", false)
    let finish!: (response: Response) => void
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal
      return new Promise<Response>((resolve) => {
        finish = resolve
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    const pending = client
      .savePreferences({ version: 1 })
      .catch((error: unknown) => error)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const unsubscribed = vi.fn()
    client.onEndedSessionWritesChange(unsubscribed)()

    endSession(client)

    expect(signal?.aborted).toBe(false)
    expect(client.hasActiveRequests()).toBe(false)
    expect(client.endedSessionWriteCount()).toBe(1)
    finish(new Response("{}"))
    expect(await pending).toBeInstanceOf(SessionEndedError)
    expect(client.endedSessionWriteCount()).toBe(0)
    expect(unsubscribed).not.toHaveBeenCalled()
  })

  it.each([
    { name: "uploadCSVFile", run: upload },
    {
      name: "savePreferences",
      run: (client: Client) => client.savePreferences({ version: 1 }),
    },
  ])("cancels $name while it still waits for renewal", async ({ run }) => {
    installExpired()
    const requests = mockUploadRequests()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    let refreshing = false
    client.refreshTokenMethod = () => {
      refreshing = true
      return new Promise(() => {})
    }
    const rejected = expect(run(client)).rejects.toBeInstanceOf(
      SessionEndedError,
    )
    await vi.waitFor(() => expect(refreshing).toBe(true))
    expect(client.hasActiveRequests()).toBe(true)
    const counts = vi.fn()
    client.onEndedSessionWritesChange(counts)

    endSession(client)

    await rejected
    expect(client.hasActiveRequests()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(requests).toHaveLength(0)
    // Nothing was sent, so leaving the page cannot cancel anything.
    expect(client.endedSessionWriteCount()).toBe(0)
    expect(counts).not.toHaveBeenCalled()
  })

  it("still aborts SQL that was sent", async () => {
    installToken("initial", false)
    let signal: AbortSignal | null | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        })
      }),
    )
    const client = new Client()
    const result = client
      .queryRaw("INSERT INTO trades VALUES (1)")
      .catch((error: unknown) => error)
    await vi.waitFor(() => expect(client.hasSentRequests()).toBe(true))

    endSession(client)

    expect(signal?.aborted).toBe(true)
    expect(await result).toMatchObject({ sessionEnded: true })
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
