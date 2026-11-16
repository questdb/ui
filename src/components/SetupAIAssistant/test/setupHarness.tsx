import { installNativeAbortSignals } from "../../../test/nativeAbortSignals"
import "@testing-library/jest-dom/vitest"
import React from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../../theme"
import { ThemeCssVariables } from "../../../theme/css-variables"
import rootReducer from "../../../store/reducers"
import { LocalStorageProvider } from "../../../providers/LocalStorageProvider"
import { AIStatusProvider } from "../../../providers/AIStatusProvider"
import { ToastContainer, toast } from "../../Toast"
import { TooltipProvider } from "../../Tooltip"
import { SetupAIAssistant } from ".."
import { AIChatButton } from "../../../scenes/Layout/AIChatButton"
import type { AiAssistantSettings } from "../../../providers/LocalStorageProvider/types"

vi.mock("../../../providers/AIConversationProvider", () => ({
  useAIConversation: () => ({ isStreaming: false }),
  useAIConversationActions: () => ({
    openOrCreateBlankChatWindow: vi.fn(),
    closeChatWindow: vi.fn(),
  }),
}))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

// Vitest 1 otherwise leaves Node's native storage in place of jsdom's storage.
const storage = vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
  vi.stubGlobal("sessionStorage", jsdom.window.sessionStorage)
  return {
    local: jsdom.window.localStorage,
    session: jsdom.window.sessionStorage,
  }
})

export const OPENAI_LISTING = {
  object: "list",
  data: [
    { id: "gpt-5.4", object: "model", created: 1772000000 },
    { id: "gpt-5-mini", object: "model", created: 1754500000 },
    { id: "gpt-5", object: "model", created: 1754400000 },
    { id: "gpt-5-nano", object: "model", created: 1754300000 },
    { id: "gpt-5-2025-08-06", object: "model", created: 1754400000 },
    { id: "whisper-1", object: "model", created: 1677532384 },
  ],
}
export const ANTHROPIC_LISTING = {
  data: [
    {
      type: "model",
      id: "claude-opus-4-5",
      display_name: "Claude Opus 4.5",
      created_at: "2025-11-01T00:00:00Z",
    },
    {
      type: "model",
      id: "claude-sonnet-4-5",
      display_name: "Claude Sonnet 4.5",
      created_at: "2025-09-29T00:00:00Z",
    },
    {
      type: "model",
      id: "claude-haiku-4-5",
      display_name: "Claude Haiku 4.5",
      created_at: "2025-10-01T00:00:00Z",
    },
  ],
  has_more: false,
  first_id: "claude-opus-4-5",
  last_id: "claude-haiku-4-5",
}
export const configuredOpenAI = {
  modelValueFormat: 2 as const,
  selectedModel: "openai:gpt-5.4",
  providers: {
    openai: {
      apiKey: "test-openai-key",
      enabledModels: ["openai:gpt-5.4"],
      grantSchemaAccess: false,
    },
  },
}

export const storedSettings = (): AiAssistantSettings =>
  JSON.parse(
    localStorage.getItem("ai.assistant.settings") ?? "{}",
  ) as AiAssistantSettings
export const queryByHook = (hook: string): HTMLElement | null =>
  document.querySelector(`[data-hook="${hook}"]`)
export const getByHook = (hook: string): HTMLElement => {
  const element = queryByHook(hook)
  if (!element) throw new Error(`Missing data-hook: ${hook}`)
  return element
}
export const getAllByHook = (hook: string): HTMLElement[] =>
  Array.from(document.querySelectorAll(`[data-hook="${hook}"]`))

export const modelServer = () => {
  const server = {
    requests: [] as Request[],
    reply: (request: Request): Response | Promise<Response> =>
      Response.json(
        request.url.includes("anthropic.com")
          ? ANTHROPIC_LISTING
          : OPENAI_LISTING,
      ),
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      server.requests.push(request)
      if (!new URL(request.url).pathname.endsWith("/models"))
        throw new Error(`Unexpected HTTP request: ${request.url}`)
      return server.reply(request)
    }),
  )
  return server
}
export const deferredResponse = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((complete) => {
    resolve = complete
  })
  return {
    promise,
    respond: async (response: Response) => {
      await act(async () => {
        resolve(response)
        await promise
      })
    },
  }
}

export const renderAISettings = (
  children: React.ReactNode = (
    <>
      <SetupAIAssistant />
      <AIChatButton />
    </>
  ),
  settings?: AiAssistantSettings,
) => {
  if (settings)
    localStorage.setItem("ai.assistant.settings", JSON.stringify(settings))
  return render(
    <ThemeProvider theme={darkTheme}>
      <ThemeCssVariables />
      <TooltipProvider>
        <Provider store={createStore(rootReducer)}>
          <LocalStorageProvider>
            <AIStatusProvider>
              {children}
              <ToastContainer />
            </AIStatusProvider>
          </LocalStorageProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

export const openConfiguration = async () => {
  await userEvent.click(getByHook("ai-assistant-settings-button"))
  await waitFor(() => expect(getByHook("ai-promo-modal")).toBeVisible())
  await userEvent.click(getByHook("ai-promo-continue"))
}
export const openSettings = async (provider = "openai") => {
  await userEvent.click(getByHook("ai-assistant-settings-button"))
  await userEvent.click(getByHook(`ai-settings-provider-${provider}`))
}
beforeEach(() => {
  installNativeAbortSignals()
  vi.stubGlobal("localStorage", storage.local)
  vi.stubGlobal("sessionStorage", storage.session)
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, "", "/")
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})
afterEach(() => {
  cleanup()
  toast.dismiss()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
