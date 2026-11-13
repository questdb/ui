import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"
import React, { useContext, useEffect, useRef, useState } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"
import { Provider } from "react-redux"
import { applyMiddleware, createStore } from "redux"
import { createEpicMiddleware } from "redux-observable"
import { Subject } from "rxjs"
import { takeUntil } from "rxjs/operators"
import { ThemeProvider } from "styled-components"
import { Base64 } from "js-base64"
import { darkTheme } from "../../../../src/theme"
import { ThemeCssVariables } from "../../../../src/theme/css-variables"
import rootReducer from "../../../../src/store/reducers"
import { getServerInfo } from "../../../../src/store/Telemetry/epics"
import type { StoreAction, StoreShape } from "../../../../src/types"
import { ToastContainer, toast } from "../../../../src/components/Toast"
import { Button } from "../../../../src/components/Button"
import { TooltipProvider } from "../../../../src/components/Tooltip"
import { AuthProvider, useAuth } from "../../../../src/providers/AuthProvider"
import {
  QuestContext,
  QuestProvider,
} from "../../../../src/providers/QuestProvider"
import { SettingsProvider } from "../../../../src/providers/SettingsProvider"
import type { Settings } from "../../../../src/providers/SettingsProvider/types"
import { authSessionState } from "../../../../src/modules/OAuth2/authSessionState"
import { tokenRefresh } from "../../../../src/utils/questdb/tokenRefresh"

// Vitest 1 leaves Node's native storage in place instead of jsdom's storage.
const browserStorage = vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
  vi.stubGlobal("sessionStorage", jsdom.window.sessionStorage)
  return {
    localStorage: jsdom.window.localStorage,
    sessionStorage: jsdom.window.sessionStorage,
  }
})

export const oidcSettings: Settings = {
  "release.type": "EE",
  "release.version": "1.2.3",
  "acl.enabled": true,
  "acl.basic.auth.realm.enabled": false,
  "acl.oidc.enabled": true,
  "acl.oidc.client.id": "test-client",
  "acl.oidc.authorization.endpoint": "https://oauth.example.com/auth",
  "acl.oidc.token.endpoint": "https://oauth.example.com/token",
  "acl.oidc.state.required": false,
  "acl.oidc.groups.encoded.in.token": false,
}

export const initialToken = {
  access_token: "initial-access-token",
  refresh_token: "initial-refresh-token",
  token_type: "Bearer",
  expires_in: 3600,
}

export const queryResult = {
  query: "select current_user()",
  columns: [{ name: "current_user", type: "STRING" }],
  dataset: [["signed-in-user"]],
  count: 1,
}

export type HttpRequest = {
  url: URL
  headers: Headers
  body: URLSearchParams
  signal: AbortSignal | null | undefined
}

type Reply = (request: HttpRequest) => Response | Promise<Response>

export const authServer = (
  settings: Settings = oidcSettings,
  basePath = "/",
) => {
  const requests: HttpRequest[] = []
  const server: { token: Reply; exec: Reply } = {
    token: () => Response.json(initialToken),
    exec: () => Response.json(queryResult),
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const request = {
        url: new URL(input, location.href),
        headers: new Headers(init?.headers),
        body: new URLSearchParams(init?.body as string | undefined),
        signal: init?.signal,
      }
      requests.push(request)
      const path = request.url.pathname
      if (path === `${basePath}settings`)
        return Response.json({ config: settings })
      if (path === `${basePath}warnings`) return Response.json([])
      if (path === `${basePath}assets/console-configuration.json`)
        return Response.json({})
      if (path.startsWith(`${basePath}assets/`))
        throw new TypeError("Image downloads are outside the auth fixture")
      if (path === "/token") return server.token(request)
      if (path === `${basePath}exec`) return server.exec(request)
      throw new Error(`Unexpected request: ${input}`)
    }),
  )
  return Object.assign(server, {
    requests,
    grants: () =>
      requests
        .filter(({ url }) => url.pathname === "/token")
        .map(({ body }) => body.get("grant_type")),
    sql: (query: string) =>
      requests.filter(
        ({ url }) =>
          url.pathname === `${basePath}exec` &&
          url.searchParams.get("query") === query,
      ),
  })
}

export const callback = (search = "?code=code-from-the-provider") => {
  history.replaceState(null, "", `${location.pathname}${search}`)
}

export const idToken = (subject: string, lifetimeSeconds: number) => {
  const iat = Math.floor(Date.now() / 1000)
  return `header.${Base64.encodeURI(JSON.stringify({ sub: subject, iat, exp: iat + lifetimeSeconds }))}.signature`
}

export const deferredResponse = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((complete) => {
    resolve = complete
  })
  return {
    promise,
    resolve,
    respond: async (response: Response) => {
      await act(async () => {
        resolve(response)
        await promise
      })
    },
  }
}

const QueryDriver = () => {
  const { quest } = useContext(QuestContext)
  const { logout } = useAuth()
  const [result, setResult] = useState("")
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const run = async () => {
    setResult("")
    try {
      const result = await quest.queryRaw("select current_user()")
      if (mounted.current) setResult(JSON.stringify(result))
    } catch (error) {
      if (!mounted.current) return
      setResult(
        (error as { error?: string; message?: string }).error ??
          (error as Error).message,
      )
    }
  }
  return (
    <section aria-label="Protected content">
      <Button onClick={() => void run()}>Run query</Button>
      <Button onClick={() => logout({ reload: false })}>Sign out</Button>
      <output aria-label="Query result">{result}</output>
    </section>
  )
}

const disposeEpics: Array<() => void> = []
export const renderAuth = () => {
  const stop = new Subject<void>()
  const epic = createEpicMiddleware<StoreAction, StoreAction, StoreShape>()
  const store = createStore(rootReducer, applyMiddleware(epic))
  epic.run((...args) => getServerInfo(...args).pipe(takeUntil(stop)))
  disposeEpics.push(() => {
    stop.next()
    stop.complete()
  })
  return render(
    <ThemeProvider theme={darkTheme}>
      <ThemeCssVariables />
      <TooltipProvider>
        <Provider store={store}>
          <SettingsProvider>
            <AuthProvider>
              <ToastContainer />
              <QuestProvider>
                <QueryDriver />
              </QuestProvider>
            </AuthProvider>
          </SettingsProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal("localStorage", browserStorage.localStorage)
  vi.stubGlobal("sessionStorage", browserStorage.sessionStorage)
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, "", "/")
})

afterEach(() => {
  disposeEpics.splice(0).forEach((dispose) => dispose())
  cleanup()
  act(() => {
    toast.dismiss()
    authSessionState.endSession()
    tokenRefresh.syncSession()
  })
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
