// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  configuredOpenAI,
  getByHook,
  modelServer,
  queryByHook,
  renderAISettings,
} from "../SetupAIAssistant/test/setupHarness"
import { EXPECTED_MCP_VERSION } from "../../utils/mcp/protocolVersion"
import { StoreKey } from "../../utils/localStorage/types"
import { connectCommandOf, consoleUrlOf } from "./connectCommand"

const thisConsole = () => consoleUrlOf(window.location)

describe("connectCommandOf", () => {
  it("connects the console at its own address, under the path it is served at", () => {
    // When
    const atRoot = consoleUrlOf({
      origin: "https://questdb.acme.io",
      pathname: "/",
    })
    const underPath = consoleUrlOf({
      origin: "https://questdb.acme.io",
      pathname: "/questdb/index.html",
    })

    // Then
    expect(atRoot).toBe("https://questdb.acme.io")
    expect(underPath).toBe("https://questdb.acme.io/questdb")
    expect(connectCommandOf(underPath, "npx")).toBe(
      `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} connect https://questdb.acme.io/questdb`,
    )
    expect(connectCommandOf(underPath, "standalone")).toBe(
      `node mcp-server-questdb-${EXPECTED_MCP_VERSION}.mjs connect https://questdb.acme.io/questdb`,
    )
  })
})

describe("connecting a coding agent", () => {
  it("offers the coding agent first in the AI Assistant promo, and shows the command for this console", async () => {
    // Given
    modelServer()
    renderAISettings()
    await userEvent.click(getByHook("ai-assistant-settings-button"))
    await waitFor(() => expect(getByHook("ai-promo-modal")).toBeVisible())

    // When
    await userEvent.click(getByHook("ai-promo-connect-agent"))

    // Then
    await waitFor(() => expect(getByHook("connect-agent-dialog")).toBeVisible())
    expect(queryByHook("ai-promo-modal")).not.toBeInTheDocument()
    expect(getByHook("connect-agent-command")).toHaveTextContent(
      connectCommandOf(thisConsole(), "npx"),
    )

    // When the user runs the downloaded file instead
    await userEvent.click(getByHook("connect-agent-channel-switch"))

    // Then
    expect(getByHook("connect-agent-command")).toHaveTextContent(
      connectCommandOf(thisConsole(), "standalone"),
    )
  })

  it("invites an API key user to connect a coding agent from the model picker, until dismissed", async () => {
    // Given an assistant set up with an API key, and no coding agent
    modelServer()
    renderAISettings(undefined, configuredOpenAI)
    await userEvent.click(getByHook("chat-model-picker"))

    // When
    await userEvent.click(getByHook("chat-model-picker-agent-connect"))

    // Then the setup opens, and the picker closes
    await waitFor(() => expect(getByHook("connect-agent-dialog")).toBeVisible())
    expect(queryByHook("chat-model-picker-menu")).not.toBeInTheDocument()

    // When the user closes the setup and dismisses the invite
    await userEvent.click(getByHook("connect-agent-close"))
    await userEvent.click(getByHook("chat-model-picker"))
    await userEvent.click(getByHook("chat-model-picker-agent-dismiss"))

    // Then it is gone, also the next time the picker opens
    expect(
      queryByHook("chat-model-picker-agent-invite"),
    ).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await userEvent.click(getByHook("chat-model-picker"))
    expect(
      queryByHook("chat-model-picker-agent-invite"),
    ).not.toBeInTheDocument()
    expect(localStorage.getItem(StoreKey.LOCAL_AGENT_INVITE_DISMISSED)).toBe(
      "true",
    )
    expect(screen.getByRole("listbox", { name: "Models" })).toBeVisible()
  })
})
