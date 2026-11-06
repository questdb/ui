// @vitest-environment jsdom

import {
  authServer,
  callback,
  deferredResponse,
  idToken,
  initialToken,
  oidcSettings,
  queryResult,
  renderAuth,
} from "./support/authHarness"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../../src/theme"
import type { Settings } from "../../../src/providers/SettingsProvider/types"
import { authSessionState } from "../../../src/modules/OAuth2/authSessionState"

const protectedContent = () =>
  screen.queryByRole("region", { name: "Protected content" })
const expectReady = async () => {
  expect(
    await screen.findByRole("region", { name: "Protected content" }),
  ).toBeVisible()
  expect(
    screen.queryByRole("heading", { name: "Sign in to QuestDB" }),
  ).not.toBeInTheDocument()
}
const expectLogin = async () => {
  expect(
    await screen.findByRole("heading", { name: "Sign in to QuestDB" }),
  ).toBeVisible()
  expect(protectedContent()).not.toBeInTheDocument()
}
const expectSignInError = async (message: string | RegExp) => {
  const error = await screen.findByRole("group", {
    name: /something went wrong|missing ID token|sign in again/i,
  })
  expect(error).toHaveTextContent(message)
  expect(error).toHaveFocus()
  await expectLogin()
  return error
}

describe("authentication modes", () => {
  it.each([
    {
      name: "OSS",
      settings: { "release.type": "OSS" },
      ready: true,
      sso: false,
    },
    {
      name: "UI passwords",
      settings: { ...oidcSettings, "acl.oidc.enabled": false },
      ready: false,
      sso: false,
    },
    { name: "OIDC", settings: oidcSettings, ready: false, sso: true },
    {
      name: "browser Basic authentication",
      settings: {
        ...oidcSettings,
        "acl.basic.auth.realm.enabled": true,
        "acl.oidc.enabled": false,
      },
      ready: true,
      sso: false,
    },
    {
      name: "disabled ACL with Basic enabled",
      settings: {
        ...oidcSettings,
        "acl.enabled": false,
        "acl.basic.auth.realm.enabled": true,
        "acl.oidc.enabled": false,
      },
      ready: true,
      sso: false,
    },
  ])(
    "uses the $name settings to gate protected content",
    async ({ settings, ready, sso }) => {
      // Given
      const config = settings as Settings
      const server = authServer(config)

      // When
      renderAuth()

      // Then
      if (ready) {
        await expectReady()
      } else {
        await expectLogin()
        expect(screen.getByLabelText("Username")).toBeVisible()
        expect(screen.getByLabelText("Password")).toBeVisible()
        expect(
          !!screen.queryByRole("button", { name: "Single Sign-On (SSO)" }),
        ).toBe(sso)
      }
      expect(server.sql("select 42")).toHaveLength(
        config["acl.enabled"] && config["acl.basic.auth.realm.enabled"] ? 1 : 0,
      )
      expect(server.grants()).toEqual([])
    },
  )
})

describe("OIDC callback handling", () => {
  it("rejects a required callback state when this tab has no saved state", async () => {
    // Given
    const server = authServer({
      ...oidcSettings,
      "acl.oidc.state.required": true,
    })
    callback("?code=attacker-code&state=attacker-state")

    // When
    renderAuth()

    // Then
    await expectLogin()
    expect(server.grants()).toEqual([])
    expect(location.search).toBe("")
  })

  it("exchanges a bare code when the server does not require state", async () => {
    // Given
    const server = authServer()
    callback()

    // When
    renderAuth()

    // Then
    await expectReady()
    expect(server.grants()).toEqual(["authorization_code"])
    expect(
      server.requests
        .find(({ url }) => url.pathname === "/token")
        ?.body.get("code"),
    ).toBe("code-from-the-provider")
  })

  it("cleans a provider error from the URL and does not repeat it after remount", async () => {
    // Given
    const server = authServer()
    sessionStorage.setItem("oauth.return.params", "query=select+1")
    callback("?error=access_denied&error_description=Sign-in+cancelled")
    const view = renderAuth()
    await expectSignInError("access_denied: Sign-in cancelled")
    expect(location.search).toBe("?query=select+1")

    // When
    view.unmount()
    renderAuth()

    // Then
    await expectLogin()
    expect(
      screen.queryByText("access_denied: Sign-in cancelled"),
    ).not.toBeInTheDocument()
    expect(server.grants()).toEqual([])
  })

  it("returns focus to the heading when the user dismisses the SSO error", async () => {
    // Given
    authServer()
    callback("?error=access_denied&error_description=Sign-in+cancelled")
    renderAuth()
    await expectSignInError("access_denied: Sign-in cancelled")

    // When
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss sign-in error" }),
    )

    // Then
    expect(
      screen.queryByRole("group", { name: "Something went wrong." }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Sign in to QuestDB" }),
    ).toHaveFocus()
  })

  it("keeps password focus while clearing an SSO error and rejecting the password", async () => {
    // Given
    const server = authServer()
    const passwordReply = deferredResponse()
    server.exec = () => passwordReply.promise
    callback("?error=access_denied&error_description=Sign-in+cancelled")
    renderAuth()
    await expectSignInError("access_denied: Sign-in cancelled")
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Username"), "admin")
    const password = screen.getByLabelText("Password")

    // When
    await user.type(password, "wrong{Enter}")

    // Then
    await waitFor(() =>
      expect(
        server.sql(
          "alter user 'admin' create token type rest with ttl '1d' refresh transient",
        ),
      ).toHaveLength(1),
    )
    expect(
      screen.queryByRole("group", { name: "Something went wrong." }),
    ).not.toBeInTheDocument()
    expect(password).toHaveFocus()
    await passwordReply.respond(new Response("Unauthorized", { status: 401 }))
    expect(
      await screen.findByText("Invalid username or password"),
    ).toBeVisible()
    expect(password).toHaveFocus()
    expect(protectedContent()).not.toBeInTheDocument()
  })

  it.each([
    {
      failure: "network error",
      reply: () => Promise.reject(new TypeError("Failed to fetch")),
      message:
        "Could not reach the identity provider to complete the sign-in. Please try again.",
    },
    {
      failure: "non-JSON 502",
      reply: () => new Response("<html>Bad Gateway</html>", { status: 502 }),
      message:
        "The identity provider returned an unexpected response (HTTP 502). Please try again.",
    },
  ])(
    "shows a focused Login error after a token endpoint $failure",
    async ({ reply, message }) => {
      // Given
      const server = authServer()
      server.token = reply
      callback()

      // When
      renderAuth()

      // Then
      await expectSignInError(message)
      expect(
        server
          .sql("select 2")
          .filter(({ url }) => url.searchParams.get("session") === "true"),
      ).toHaveLength(0)
    },
  )

  it("aborts a token exchange after ten seconds and focuses its timeout error", async () => {
    // Given
    const server = authServer()
    let signal: AbortSignal | null | undefined
    server.token = (request) => {
      signal = request.signal
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        )
      })
    }
    callback()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    await act(async () => {
      renderAuth()
      await Promise.resolve()
    })
    expect(server.grants()).toEqual(["authorization_code"])

    // When
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999)
    })
    expect(signal?.aborted).toBe(false)
    expect(protectedContent()).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    vi.useRealTimers()

    // Then
    expect(signal?.aborted).toBe(true)
    await expectSignInError(
      "The identity provider did not respond within 10 seconds. Please try again.",
    )
    expect(authSessionState.isAuthenticated()).toBe(false)
  })
})

describe("SSO bearer selection and installation", () => {
  it.each([false, true])(
    "keeps stored password credentials while SQL uses this tab's SSO identity (ID bearer: %s)",
    async (idBearer) => {
      // Given
      const initial = idToken("initial", 3600)
      const server = authServer({
        ...oidcSettings,
        "acl.oidc.groups.encoded.in.token": idBearer,
      })
      server.token = () =>
        Response.json({
          ...initialToken,
          access_token: initial,
          id_token: initial,
        })
      localStorage.setItem("rest.token", "other-tab-rest-token")
      localStorage.setItem("basic.auth.header", "Basic other-tab")
      callback()

      // When
      renderAuth()
      await expectReady()
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      expect(await screen.findByText(/signed-in-user/)).toBeVisible()
      expect(
        server.sql("select current_user()")[0].headers.get("Authorization"),
      ).toBe(`Bearer ${initial}`)
      expect(localStorage.getItem("rest.token")).toBe("other-tab-rest-token")
      expect(localStorage.getItem("basic.auth.header")).toBe("Basic other-tab")
      expect(sessionStorage.getItem("auth.login.method")).toBe("sso")
    },
  )

  it.each([
    { idLifetime: 20, accessLifetime: 3600, refresh: true },
    { idLifetime: 3600, accessLifetime: 20, refresh: false },
  ])(
    "uses the ID token's lifetime ($idLifetime seconds), not the access lifetime ($accessLifetime seconds)",
    async ({ idLifetime, accessLifetime, refresh }) => {
      // Given
      const server = authServer({
        ...oidcSettings,
        "acl.oidc.groups.encoded.in.token": true,
      })
      const initial = idToken("initial", idLifetime)
      const renewed = idToken("renewed", 3600)
      server.token = ({ body }) =>
        Response.json({
          ...initialToken,
          expires_in: accessLifetime,
          id_token:
            body.get("grant_type") === "refresh_token" ? renewed : initial,
        })
      callback()

      // When
      renderAuth()

      // Then
      await expectReady()
      expect(
        server
          .sql("SELECT 1")
          .map(({ headers }) => headers.get("Authorization")),
      ).toEqual([`Bearer ${refresh ? renewed : initial}`])
      expect(server.grants()).toEqual(
        refresh
          ? ["authorization_code", "refresh_token"]
          : ["authorization_code"],
      )
    },
  )

  it.each(["sign-in", "renewal"])(
    "explains a missing required ID token during %s and blocks SQL",
    async (phase) => {
      // Given
      const server = authServer({
        ...oidcSettings,
        "acl.oidc.groups.encoded.in.token": true,
      })
      const initial = idToken("initial", 20)
      server.token = ({ body }) =>
        Response.json({
          ...initialToken,
          ...(phase === "renewal" &&
          body.get("grant_type") === "authorization_code"
            ? { id_token: initial }
            : {}),
        })
      callback()

      // When
      renderAuth()

      // Then
      await expectSignInError(
        phase === "sign-in"
          ? "needed to sign you in."
          : "needed to keep you signed in.",
      )
      expect(
        screen.getByText(
          /ask your administrator to check the SSO configuration/,
        ),
      ).toBeVisible()
      expect(server.sql("SELECT 1")).toHaveLength(0)
      expect(
        server
          .sql("select 2")
          .filter(({ url }) => url.searchParams.get("session") === "true"),
      ).toHaveLength(phase === "sign-in" ? 0 : 1)
      expect(server.grants()).toEqual(
        phase === "sign-in"
          ? ["authorization_code"]
          : ["authorization_code", "refresh_token"],
      )
      expect(location.search).toBe("")
    },
  )

  it.each([false, true])(
    "renews a rejected startup bearer once (ID bearer: %s)",
    async (idBearer) => {
      // Given
      const server = authServer({
        ...oidcSettings,
        "acl.oidc.groups.encoded.in.token": idBearer,
      })
      server.token = ({ body }) => {
        const token =
          body.get("grant_type") === "authorization_code"
            ? "rejected"
            : "accepted"
        return Response.json({
          ...initialToken,
          access_token: token,
          id_token: token,
        })
      }
      const rejectedSession = deferredResponse()
      server.exec = ({ headers, url }) => {
        if (url.searchParams.get("query") === "select 2")
          return rejectedSession.promise
        if (headers.get("Authorization") === "Bearer rejected") {
          rejectedSession.resolve(new Response("Unauthorized", { status: 401 }))
          return new Response("Unauthorized", { status: 401 })
        }
        return Response.json(queryResult)
      }
      callback()

      // When
      renderAuth()
      await expectReady()
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      expect(await screen.findByText(/signed-in-user/)).toBeVisible()
      const sequence = (query: string) =>
        server.sql(query).map(({ headers, url }) => ({
          bearer: headers.get("Authorization"),
          session: url.searchParams.get("session"),
        }))
      expect(sequence("select 2")).toEqual([
        { bearer: "Bearer rejected", session: "true" },
      ])
      expect(sequence("SELECT 1")).toEqual([
        { bearer: "Bearer rejected", session: null },
        { bearer: "Bearer accepted", session: "true" },
      ])
      expect(sequence("select current_user()")).toEqual([
        { bearer: "Bearer accepted", session: null },
      ])
      expect(server.grants()).toEqual(["authorization_code", "refresh_token"])
    },
  )

  it.each(["300", "3600", 0, -1, null])(
    "releases protected content for optional lifetime %j and null optional fields",
    async (expires_in) => {
      // Given
      const server = authServer()
      server.token = () =>
        Response.json({
          access_token: "initial-access-token",
          expires_in,
          refresh_token: null,
          id_token: null,
          token_type: null,
          error: null,
          error_description: null,
        })
      callback()

      // When
      renderAuth()

      // Then
      await expectReady()
      expect(
        server
          .sql("SELECT 1")
          .map(({ headers }) => headers.get("Authorization")),
      ).toEqual(["Bearer initial-access-token"])
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))
      expect(await screen.findByText(/signed-in-user/)).toBeVisible()
      expect(
        server.sql("select current_user()")[0].headers.get("Authorization"),
      ).toBe("Bearer initial-access-token")
      expect(server.grants()).toEqual(["authorization_code"])
    },
  )

  it("uses a token with unknown expiry until rejection, then shows Login without resending SQL", async () => {
    // Given
    const server = authServer()
    server.token = () =>
      Response.json({
        access_token: "initial-access-token",
        refresh_token: "unused-refresh-token",
      })
    callback()
    renderAuth()
    await expectReady()
    server.exec = ({ url }) =>
      url.searchParams.get("query") === "select current_user()"
        ? new Response("Unauthorized", { status: 401 })
        : Response.json(queryResult)

    // When
    await userEvent.click(screen.getByRole("button", { name: "Run query" }))

    // Then
    await expectLogin()
    expect(server.sql("select current_user()")).toHaveLength(1)
    expect(server.grants()).toEqual(["authorization_code"])
    expect(authSessionState.isAuthenticated()).toBe(false)
  })
})

describe("auth recovery", () => {
  it.each(
    [
      {
        failure: "JSON 429",
        reply: () => Response.json({ error: "rate_limited" }, { status: 429 }),
      },
      {
        failure: "network error",
        reply: () => Promise.reject(new TypeError("Failed to fetch")),
      },
      {
        failure: "non-JSON 502",
        reply: () => new Response("<html>Bad Gateway</html>", { status: 502 }),
      },
    ].flatMap((failure) =>
      [true, false].map((idBearer) => ({ ...failure, idBearer })),
    ),
  )(
    "survives a refresh $failure and SQL 401, then recovers with rotated credentials (ID bearer: $idBearer)",
    async ({ reply, idBearer }) => {
      // Given
      let now = Date.now()
      vi.spyOn(Date, "now").mockImplementation(() => now)
      const initial = idBearer ? idToken("initial", 20) : "initial-access"
      const server = authServer({
        ...oidcSettings,
        "acl.oidc.groups.encoded.in.token": idBearer,
      })
      server.token = ({ body }) =>
        body.get("grant_type") === "authorization_code"
          ? Response.json({
              ...initialToken,
              access_token: initial,
              id_token: initial,
              expires_in: idBearer ? 3600 : 20,
            })
          : reply()
      callback()
      renderAuth()
      await expectReady()
      expect(server.sql("SELECT 1")[0].headers.get("Authorization")).toBe(
        `Bearer ${initial}`,
      )
      expect(server.grants()).toEqual(["authorization_code", "refresh_token"])
      server.exec = ({ url }) =>
        url.searchParams.get("query") === "select current_user()"
          ? new Response("Unauthorized", { status: 401 })
          : Response.json(queryResult)

      // When
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      await waitFor(() =>
        expect(screen.getByLabelText("Query result")).toHaveTextContent(
          "the request was not executed",
        ),
      )
      expect(server.sql("select current_user()")).toHaveLength(1)
      expect(authSessionState.isAuthenticated()).toBe(true)
      expect(localStorage.getItem("sso.session.active")).toBe("true")
      await expectReady()

      // When
      const renewed = idBearer ? idToken("renewed", 3600) : "renewed-access"
      server.token = () =>
        Response.json({
          ...initialToken,
          access_token: renewed,
          id_token: renewed,
          refresh_token: "rotated-refresh-token",
        })
      server.exec = () => Response.json(queryResult)
      now += 5000
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      await waitFor(() =>
        expect(screen.getByLabelText("Query result")).toHaveTextContent(
          "signed-in-user",
        ),
      )
      expect(
        server.sql("select current_user()")[1].headers.get("Authorization"),
      ).toBe(`Bearer ${renewed}`)
      expect(authSessionState.hasRefreshFailed()).toBe(false)

      // When
      now += 3600000
      const renewedAgain = idBearer
        ? idToken("renewed-again", 7200)
        : "renewed-again-access"
      server.token = ({ body }) => {
        expect(body.get("refresh_token")).toBe("rotated-refresh-token")
        return Response.json({
          ...initialToken,
          access_token: renewedAgain,
          id_token: renewedAgain,
          refresh_token: "next-refresh-token",
        })
      }
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      await waitFor(() =>
        expect(screen.getByLabelText("Query result")).toHaveTextContent(
          "signed-in-user",
        ),
      )
      expect(
        server.sql("select current_user()")[2].headers.get("Authorization"),
      ).toBe(`Bearer ${renewedAgain}`)
      expect(server.grants()).toEqual([
        "authorization_code",
        "refresh_token",
        "refresh_token",
        "refresh_token",
      ])
      await expectReady()
    },
  )

  it("hands focus from the refresh warning to Login, then to the heading and username", async () => {
    // Given
    const server = authServer({
      ...oidcSettings,
      "acl.oidc.groups.encoded.in.token": true,
    })
    const initial = idToken("initial", 20)
    server.token = ({ body }) =>
      body.get("grant_type") === "authorization_code"
        ? Response.json({ ...initialToken, id_token: initial })
        : Response.json({ error: "temporarily_unavailable" }, { status: 503 })
    callback()
    renderAuth()
    await expectReady()
    const signIn = await screen.findByRole("button", { name: "Sign in again" })

    // When
    await userEvent.click(signIn)

    // Then
    await expectSignInError("Your previous session has ended")
    expect(authSessionState.isAuthenticated()).toBe(false)
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss sign-in error" }),
    )
    expect(
      screen.getByRole("heading", { name: "Sign in to QuestDB" }),
    ).toHaveFocus()
    await userEvent.type(screen.getByLabelText("Username"), "admin")
    expect(screen.getByLabelText("Username")).toHaveFocus()
    expect(screen.getByLabelText("Username")).toHaveValue("admin")
  })

  it("starts the real telemetry request only after authorization, using the renewed bearer", async () => {
    // Given
    const server = authServer({
      ...oidcSettings,
      "acl.oidc.groups.encoded.in.token": true,
    })
    const initial = idToken("initial", 20)
    const renewed = idToken("renewed", 3600)
    server.token = ({ body }) =>
      Response.json({
        ...initialToken,
        id_token:
          body.get("grant_type") === "authorization_code" ? initial : renewed,
      })
    const authReply = deferredResponse()
    server.exec = ({ url }) =>
      url.searchParams.get("query") === "SELECT 1"
        ? authReply.promise
        : Response.json(queryResult)
    callback()
    renderAuth()
    await waitFor(() => expect(server.sql("SELECT 1")).toHaveLength(1))
    expect(server.sql("telemetry_config limit -1")).toHaveLength(0)
    expect(protectedContent()).not.toBeInTheDocument()

    // When
    await authReply.respond(Response.json(queryResult))

    // Then
    await expectReady()
    await waitFor(() =>
      expect(server.sql("telemetry_config limit -1")).toHaveLength(1),
    )
    expect(server.sql("SELECT 1")[0].headers.get("Authorization")).toBe(
      `Bearer ${renewed}`,
    )
    expect(
      server.sql("telemetry_config limit -1")[0].headers.get("Authorization"),
    ).toBe(`Bearer ${renewed}`)
    expect(server.grants()).toEqual(["authorization_code", "refresh_token"])
  })

  it("keeps Retry focused and busy, announces failure, and releases content after recovery", async () => {
    // Given
    const server = authServer()
    server.token = () => Response.json({ access_token: "initial-access-token" })
    const second = deferredResponse()
    const third = deferredResponse()
    let attempts = 0
    server.exec = ({ url }) => {
      if (url.searchParams.get("query") !== "SELECT 1")
        return Response.json(queryResult)
      attempts++
      if (attempts === 1) return new Response("", { status: 502 })
      return attempts === 2 ? second.promise : third.promise
    }
    callback()
    renderAuth()
    const heading = await screen.findByRole("heading", {
      name: "Could not connect to QuestDB",
    })
    expect(heading).toHaveFocus()
    expect(screen.getByText("QuestDB is not reachable [502]")).toHaveStyle({
      color: darkTheme.color.statusDanger,
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "QuestDB is not reachable [502]",
    )
    const retry = screen.getByRole("button", { name: "Retry connection" })

    // When
    await userEvent.click(retry)
    await userEvent.click(retry)

    // Then
    expect(retry).toHaveFocus()
    expect(retry).toHaveAttribute("aria-disabled", "true")
    expect(retry).toHaveAttribute("aria-busy", "true")
    expect(retry).not.toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "QuestDB is not reachable [502]",
    )
    expect(protectedContent()).not.toBeInTheDocument()
    expect(attempts).toBe(2)

    // When
    await second.respond(new Response("", { status: 502 }))

    // Then
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connection failed. Retry connection.",
    )
    expect(retry).toHaveFocus()
    expect(retry).toHaveAttribute("aria-busy", "false")

    // When
    await userEvent.click(retry)
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…")
    expect(attempts).toBe(3)
    await third.respond(Response.json(queryResult))

    // Then
    await expectReady()
    expect(screen.getByRole("main", { name: "QuestDB console" })).toHaveFocus()
    expect(attempts).toBe(3)
  })
})

describe("unauthorized responses after stored credentials are removed", () => {
  it.each([
    {
      key: "basic.auth.header",
      value: "Basic dXNlcjpwYXNz",
      authorization: "Basic dXNlcjpwYXNz",
      oidc: false,
    },
    {
      key: "basic.auth.header",
      value: "Basic dXNlcjpwYXNz",
      authorization: "Basic dXNlcjpwYXNz",
      oidc: true,
    },
    {
      key: "rest.token",
      value: "rest-token",
      authorization: "Bearer rest-token",
      oidc: false,
    },
  ])(
    "removes protected content on SQL 401 with $key and OIDC $oidc",
    async ({ key, value, authorization, oidc }) => {
      // Given
      const server = authServer({ ...oidcSettings, "acl.oidc.enabled": oidc })
      localStorage.setItem(key, value)
      renderAuth()
      await expectReady()
      localStorage.removeItem(key)
      const rejected = deferredResponse()
      server.exec = ({ url }) =>
        url.searchParams.get("query") === "select current_user()"
          ? rejected.promise
          : Response.json(queryResult)

      // When
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      expect(server.sql("select current_user()")).toHaveLength(1)
      expect(
        server.sql("select current_user()")[0].headers.get("Authorization"),
      ).toBe(authorization)
      expect(localStorage.getItem(key)).toBeNull()
      expect(protectedContent()).toBeVisible()

      // When
      await rejected.respond(new Response("Unauthorized", { status: 401 }))

      // Then
      await expectLogin()
      expect(authSessionState.isAuthenticated()).toBe(false)
      expect(server.sql("select current_user()")).toHaveLength(1)
    },
  )
})
