// @vitest-environment jsdom
import {
  authServer,
  callback,
  initialToken,
  oidcSettings,
  queryResult,
  renderAuth,
} from "./support/authHarness"
import { cleanup, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../../src/modules/OAuth2/authSessionState"

const navigation = vi.hoisted(() => ({ destinations: [] as string[] }))
vi.mock("../../../src/modules/OAuth2/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/modules/OAuth2/utils")>()
  return {
    ...actual,
    getAuthorisationURL: (
      ...args: Parameters<typeof actual.getAuthorisationURL>
    ) => {
      navigation.destinations.push(actual.getAuthorisationURL(...args))
      // Keep URL construction real; jsdom cannot navigate to an identity provider.
      return `${location.origin}${location.pathname}#authorization`
    },
  }
})

beforeEach(() => {
  navigation.destinations = []
})

const ready = () => screen.findByRole("region", { name: "Protected content" })

describe("Enterprise OIDC component integration", () => {
  it.each(["/console/", "/nested/console/index.html"])(
    "keeps %s through OIDC sign-in, callback cleanup, and SQL execution",
    async (path) => {
      // Given
      const query = "select 42"
      const params = new URLSearchParams({ query, executeQuery: "true" })
      history.replaceState(null, "", `${path}?${params}`)
      const server = authServer(
        oidcSettings,
        new URL(".", location.href).pathname,
      )
      renderAuth()

      // When
      await userEvent.click(
        await screen.findByRole("button", { name: "Single Sign-On (SSO)" }),
      )

      // Then
      const authorization = new URL(navigation.destinations[0])
      expect(authorization.origin).toBe("https://oauth.example.com")
      expect(authorization.searchParams.get("redirect_uri")).toBe(
        location.origin + path,
      )

      // When
      cleanup()
      callback("?code=context-code&state=context-state")
      renderAuth()
      await ready()
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      expect(await screen.findByText(/signed-in-user/)).toBeVisible()
      const exchange = server.requests.find(
        ({ body }) => body.get("grant_type") === "authorization_code",
      )!
      expect(exchange.url.href).toBe("https://oauth.example.com/token")
      expect(exchange.body.get("redirect_uri")).toBe(location.origin + path)
      expect(location.pathname).toBe(path)
      expect(new URLSearchParams(location.search)).toEqual(params)
      expect(server.sql("select current_user()")).toHaveLength(1)
    },
  )

  it.each([
    {
      failure: "network error",
      reply: () => Promise.reject(new TypeError("Failed to fetch")),
    },
    {
      failure: "non-JSON 502",
      reply: () => new Response("<html>Bad Gateway</html>", { status: 502 }),
    },
  ])(
    "keeps ordinary SQL available after a startup refresh $failure",
    async ({ reply }) => {
      // Given
      const server = authServer()
      server.token = ({ body }) =>
        body.get("grant_type") === "authorization_code"
          ? Response.json({ ...initialToken, expires_in: 20 })
          : reply()
      callback()

      // When
      renderAuth()
      await ready()
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      expect(await screen.findByText(/signed-in-user/)).toBeVisible()
      expect(
        server.sql("select current_user()")[0].headers.get("Authorization"),
      ).toBe("Bearer initial-access-token")
      expect(server.grants()).toEqual(["authorization_code", "refresh_token"])
      expect(authSessionState.isAuthenticated()).toBe(true)
    },
  )

  it.each([0, "0"])(
    "renews a zero lifetime (%j) before an ordinary SQL request",
    async (expires_in) => {
      // Given
      const server = authServer()
      server.token = ({ body }) =>
        Response.json(
          body.get("grant_type") === "authorization_code"
            ? { ...initialToken, expires_in }
            : {
                ...initialToken,
                access_token: "renewed-access",
                refresh_token: "rotated",
              },
        )
      callback()

      // When
      renderAuth()
      await ready()
      await userEvent.click(screen.getByRole("button", { name: "Run query" }))

      // Then
      expect(await screen.findByText(/signed-in-user/)).toBeVisible()
      expect(server.grants()).toEqual(["authorization_code", "refresh_token"])
      expect(
        server.sql("select current_user()")[0].headers.get("Authorization"),
      ).toBe("Bearer renewed-access")
      await userEvent.click(screen.getByRole("button", { name: "Sign out" }))
      expect(
        await screen.findByRole("heading", { name: "Sign in to QuestDB" }),
      ).toBeVisible()
      expect(
        screen.queryByRole("region", { name: "Protected content" }),
      ).not.toBeInTheDocument()
    },
  )

  it("focuses the expired-session error after an authoritative refresh rejection", async () => {
    // Given
    const server = authServer()
    callback()
    renderAuth()
    await ready()
    localStorage.setItem("sso.username.test-client", "john doe")
    server.exec = ({ url }) =>
      url.searchParams.get("query") === "select current_user()"
        ? new Response("Unauthorized", { status: 401 })
        : Response.json(queryResult)
    server.token = () =>
      Response.json({ error: "invalid_grant" }, { status: 400 })

    // When
    await userEvent.click(screen.getByRole("button", { name: "Run query" }))

    // Then
    const error = await screen.findByRole("group", {
      name: /session has expired/i,
    })
    expect(error).toHaveTextContent("Your SSO session has expired")
    expect(error).toHaveTextContent("Could not renew your SSO session")
    expect(error).toHaveFocus()
    expect(
      screen.queryByRole("region", { name: "Protected content" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Continue as john doe/ }),
    ).toBeVisible()
    expect(authSessionState.isAuthenticated()).toBe(false)
  })

  it.each([
    { name: "Continue as john doe", prompt: null },
    { name: "Choose a different account", prompt: "login" },
  ])(
    "builds the correct authorization URL for $name",
    async ({ name, prompt }) => {
      // Given
      authServer()
      localStorage.setItem("sso.username.test-client", "john doe")
      renderAuth()
      await screen.findByRole("heading", { name: "Sign in to QuestDB" })
      expect(
        screen.getByRole("button", { name: "Continue as john doe" }),
      ).toBeVisible()
      expect(
        screen.getByRole("button", { name: "Choose a different account" }),
      ).toBeVisible()

      // When
      await userEvent.click(screen.getByRole("button", { name }))

      // Then
      expect(navigation.destinations).toHaveLength(1)
      const url = new URL(navigation.destinations[0])
      expect(url.origin + url.pathname).toBe("https://oauth.example.com/auth")
      expect(url.searchParams.get("prompt")).toBe(prompt)
      expect(url.searchParams.get("client_id")).toBe("test-client")
    },
  )

  it("rejects a callback without its required state and offers a fresh account sign-in", async () => {
    // Given
    const server = authServer({
      ...oidcSettings,
      "acl.oidc.state.required": true,
    })
    localStorage.setItem("sso.username.test-client", "john doe")
    renderAuth()
    await userEvent.click(
      await screen.findByRole("button", { name: "Choose a different account" }),
    )
    const state = new URL(navigation.destinations[0]).searchParams.get("state")
    expect(state).toBeTruthy()
    expect(localStorage.getItem("oauth.state")).toBe(state)
    callback()

    // When
    const { cleanup } = await import("@testing-library/react")
    cleanup()
    renderAuth()

    // Then
    await screen.findByRole("heading", { name: "Sign in to QuestDB" })
    expect(server.grants()).toEqual([])
    expect(localStorage.getItem("oauth.state")).toBeNull()
    expect(
      screen.queryByRole("region", { name: "Protected content" }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Continue as/ }),
      ).not.toBeInTheDocument(),
    )
    // When
    await userEvent.click(
      screen.getByRole("button", { name: "Single Sign-On (SSO)" }),
    )

    // Then
    const destination = new URL(navigation.destinations.at(-1)!)
    expect(destination.searchParams.get("prompt")).toBe("login")
    expect(destination.searchParams.get("state")).toBeTruthy()
    expect(destination.searchParams.get("state")).not.toBe(state)
  })
})
