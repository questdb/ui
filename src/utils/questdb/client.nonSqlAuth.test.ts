import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../modules/OAuth2/ssoAuthState"
import { Client } from "./client"

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

const mockUploadRequests = () => {
  const requests: UploadRequest[] = []
  class UploadRequest {
    status = 200
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
    send = vi.fn(() => this.onload?.())

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
