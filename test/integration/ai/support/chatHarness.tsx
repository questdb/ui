import { installNativeAbortSignals } from "../../../../src/test/nativeAbortSignals"
import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"
import React from "react"
import { createRequire } from "node:module"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../../../src/theme"
import { TooltipProvider } from "../../../../src/components/Tooltip"
import { ToastContainer, toast } from "../../../../src/components/Toast"
import rootReducer from "../../../../src/store/reducers"
import { db } from "../../../../src/store/db"
import { aiConversationStore } from "../../../../src/store/aiConversations"
import { LocalStorageProvider } from "../../../../src/providers/LocalStorageProvider"
import { AIStatusProvider } from "../../../../src/providers/AIStatusProvider"
import { AIConversationProvider } from "../../../../src/providers/AIConversationProvider"
import { AIChatButton } from "../../../../src/scenes/Layout/AIChatButton"
// Preload the drawer with the harness's mocked dependencies before React.lazy.
import "../../../../src/scenes/Editor/AIChatWindow"
import { AIChatWindowLazy } from "../../../../src/scenes/Editor/AIChatWindow/AIChatWindowLazy"
import { createQueryKey } from "../../../../src/scenes/Editor/Monaco/utils"
import * as QuestDB from "../../../../src/utils/questdb"
import type { AiAssistantSettings } from "../../../../src/providers/LocalStorageProvider/types"
import type { AIConversation } from "../../../../src/providers/AIConversationProvider/types"
import type { EditorContext } from "../../../../src/providers/EditorProvider"

const editorAdapter = vi.hoisted(() => ({
  overrides: {} as Partial<EditorContext>,
}))
export { editorAdapter }
vi.mock("../../../../src/providers/EditorProvider", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../src/providers/EditorProvider")
    >()
  return {
    ...actual,
    useEditor: () => ({ ...actual.useEditor(), ...editorAdapter.overrides }),
  }
})
// Monaco layout remains covered by the retained browser preview and acceptance journeys.
vi.mock("@monaco-editor/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@monaco-editor/react")>()
  return {
    ...actual,
    DiffEditor: ({
      original,
      modified,
    }: {
      original: string
      modified: string
    }) => (
      <div>
        <pre>{original}</pre>
        <pre>{modified}</pre>
      </div>
    ),
  }
})

vi.mock("../../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

// Vitest 1 otherwise retains Node's native storage instead of jsdom's storage.
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

export const queryByHook = (hook: string): HTMLElement | null =>
  document.querySelector(`[data-hook="${hook}"]`)
export const getByHook = (hook: string): HTMLElement => {
  const element = queryByHook(hook)
  if (!element) throw new Error(`Missing data-hook: ${hook}`)
  return element
}
export const getAllByHook = (hook: string): HTMLElement[] =>
  Array.from(document.querySelectorAll(`[data-hook="${hook}"]`))

export const seedChat = async (
  name: string,
  overrides: Partial<AIConversation> = {},
) => {
  const conversation: AIConversation = {
    id: crypto.randomUUID(),
    conversationName: name,
    updatedAt: Date.now(),
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        content: `Question about ${name}`,
        timestamp: Date.now(),
      },
    ],
    ...overrides,
  }
  await aiConversationStore.saveConversation(conversation)
  return conversation
}

// The editor's record of a failed run, as Fix query reads it: the error from
// executionRefs and the word at the error position from the Monaco model.
export const failQuery = (
  bufferId: number,
  sql: string,
  error: { message: string; position: number },
) => {
  const queryKey = createQueryKey(sql, 0)
  const model = {
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
    getWordAtPosition: ({ column }: { column: number }) => {
      const word = /^\w+/.exec(sql.slice(column - 1))?.[0]
      return word
        ? { word, startColumn: column, endColumn: column + word.length }
        : null
    },
  }
  editorAdapter.overrides = {
    ...editorAdapter.overrides,
    editorRef: {
      current: { getModel: () => model },
    } as unknown as EditorContext["editorRef"],
    executionRefs: {
      current: {
        [bufferId]: {
          [queryKey]: {
            error: {
              type: QuestDB.Type.ERROR,
              error: error.message,
              position: error.position,
              query: sql,
            },
            queryText: sql,
            startOffset: 0,
            endOffset: sql.length,
          },
        },
      },
    },
  }
  return queryKey
}

export const renderChat = (
  provider: ProviderName = "openai",
  children?: React.ReactNode,
  settings?: AiAssistantSettings,
) => {
  const configured =
    provider === "anthropic"
      ? fixtures.getAnthropicConfiguredSettings()
      : fixtures.getOpenAIConfiguredSettings()
  localStorage.setItem(
    "ai.assistant.settings",
    settings ? JSON.stringify(settings) : configured["ai.assistant.settings"],
  )
  const store = createStore(rootReducer)
  const result = render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider>
        <Provider store={store}>
          <LocalStorageProvider>
            <AIConversationProvider>
              <AIStatusProvider>
                <AIChatButton />
                <div id="side-panel-right" />
                <AIChatWindowLazy />
                <ToastContainer />
                {children}
              </AIStatusProvider>
            </AIConversationProvider>
          </LocalStorageProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  return { ...result, store }
}

export const openChat = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Open AI Assistant" }),
  )
  await waitFor(() => expect(getByHook("ai-chat-window")).toBeVisible())
}

let clock = Date.now()
beforeEach(async () => {
  installNativeAbortSignals()
  editorAdapter.overrides = {}
  clock = Math.max(clock, Date.now()) + 3000
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(clock)
  const now = Date.now
  let tick = 0
  vi.spyOn(Date, "now").mockImplementation(() => now() + tick++)
  vi.stubGlobal("localStorage", storage.local)
  vi.stubGlobal("sessionStorage", storage.session)
  localStorage.clear()
  sessionStorage.clear()
  await db.ai_conversations.clear()
  await db.ai_conversation_messages.clear()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      throw new Error(`Unexpected HTTP request: ${String(input)}`)
    }),
  )
})
afterEach(() => {
  cleanup()
  toast.dismiss()
  clock = Math.max(clock, Date.now())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

export type ProviderName = "openai" | "anthropic" | "openai-chat-completions"
type MockResponse = {
  body: unknown
  statusCode?: number
  headers?: Record<string, string>
}
type ResponseBuilders = {
  createResponse: (
    provider: ProviderName,
    data: unknown,
    options?: { streaming?: boolean },
  ) => MockResponse
  createFinalResponse: (provider: ProviderName, text: string) => MockResponse
  createToolCallResponse: (
    provider: ProviderName,
    name: string,
    args: Record<string, unknown>,
  ) => MockResponse
  createChatTitleResponse: (
    provider: ProviderName,
    title?: string,
  ) => MockResponse
  isTitleRequest: (
    provider: ProviderName,
    body: Record<string, unknown>,
  ) => boolean
  getOpenAIConfiguredSettings: () => Record<string, string>
  getAnthropicConfiguredSettings: () => Record<string, string>
}
export const fixtures = createRequire(import.meta.url)(
  "../../../e2e/utils/aiAssistant.js",
) as ResponseBuilders
export const httpResponse = ({
  body,
  statusCode = 200,
  headers,
}: MockResponse) =>
  new Response(
    typeof body === "string" || body instanceof ReadableStream
      ? body
      : JSON.stringify(body),
    {
      status: statusCode,
      headers: headers ?? {
        "Content-Type":
          typeof body === "string" ? "text/event-stream" : "application/json",
      },
    },
  )
export const gate = () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    promise,
    release: async () => {
      await act(async () => {
        release()
        await promise
      })
    },
  }
}
export const chatServer = (
  provider: ProviderName,
  replies: Array<MockResponse | (() => Promise<MockResponse>)>,
) => {
  const server = {
    requests: [] as Array<{ request: Request; body: Record<string, unknown> }>,
    otherRequests: [] as Request[],
    other: (request: Request): Response | Promise<Response> => {
      throw new Error(`Unexpected HTTP request: ${request.url}`)
    },
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), location.href), init)
      if (
        request.method !== "POST" ||
        !/\/(responses|messages|chat\/completions)$/.test(
          new URL(request.url).pathname,
        )
      ) {
        server.otherRequests.push(request)
        return server.other(request)
      }
      const body = (await request.json()) as Record<string, unknown>
      if (fixtures.isTitleRequest(provider, body))
        return httpResponse(fixtures.createChatTitleResponse(provider))
      server.requests.push({ request, body })
      const reply = replies.shift()
      if (!reply)
        throw new Error(`Unexpected AI request: ${JSON.stringify(body)}`)
      return httpResponse(typeof reply === "function" ? await reply() : reply)
    }),
  )
  return server
}
export const sendMessage = async (text: string) => {
  await userEvent.type(getByHook("chat-input-textarea"), text)
  await userEvent.click(getByHook("chat-send-button"))
}
