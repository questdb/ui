// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../test/component"
import { NEVER_SAID, wordingOf } from "../../test/wording"
import { EXPECTED_MCP_VERSION } from "../../utils/mcp/protocolVersion"
import { StoreKey } from "../../utils/localStorage/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import type { Flow } from "./demo/scene"
import { AgentPromoModal, AGENT_PROMO_TITLE } from "./index"

const bridge = vi.hoisted(() => ({ status: "disconnected" }))
const scene = vi.hoisted(() => ({
  jumps: [] as string[],
  onFlow: null as null | ((flow: Flow) => void),
}))

vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../providers/MCPBridgeProvider", () => ({
  useMCPBridge: () => ({ status: bridge.status }),
}))
// The demo draws to a layout jsdom does not have; its own test covers it.
vi.mock("./demo/scene", () => ({
  createScene: (_root: HTMLElement, options: { onFlow: (f: Flow) => void }) => {
    scene.onFlow = options.onFlow
    return {
      jump: (flow: string) => scene.jumps.push(flow),
      relayout: () => undefined,
      time: () => 0,
      destroy: () => undefined,
    }
  },
}))

const command = `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION}`
const connectCommand = () => getHook("agent-promo-connect-command")
const terminalOption = () => getHook("agent-promo-terminal-option")

beforeEach(() => {
  bridge.status = "disconnected"
  scene.jumps = []
  scene.onFlow = null
  vi.mocked(trackEvent).mockClear()
})

describe("the coding agent promo", () => {
  it("opens for someone who closed the notebook onboarding before, says what an agent does, and offers both ways", () => {
    // Given the notebook onboarding was closed and an agent once connected
    localStorage.setItem(
      StoreKey.NOTEBOOK_ONBOARDING,
      JSON.stringify({ showNotebookPromo: false, mcpEverConnected: true }),
    )

    // When
    renderComponent(<AgentPromoModal />)

    // Then it opens, and it is marked seen
    expect(
      screen.getByRole("dialog", { name: AGENT_PROMO_TITLE }),
    ).toBeVisible()
    expect(localStorage.getItem(StoreKey.AGENT_PROMO_SEEN)).toBe("true")
    expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.AGENT_PROMO_OPEN)
    const dialog = getHook("agent-promo")
    expect(wordingOf(dialog)).not.toMatch(NEVER_SAID)
    expect(dialog).toHaveTextContent(
      "Analyze your data, monitor your instance and build dashboards with the coding agent you already have.",
    )
    for (const feature of [
      "Build dashboards",
      "Analyze data",
      "Monitor your instance",
    ])
      expect(dialog).toHaveTextContent(feature)
    // The AI Assistant way first; neither names an agent yet
    const assistant = getHook("agent-promo-ai-assistant-option")
    expect(assistant.compareDocumentPosition(terminalOption())).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(connectCommand()).toHaveTextContent(
      `${command} connect http://localhost:3000`,
    )
    expect(connectCommand()).not.toHaveTextContent("--agent")
    expect(terminalOption()).toHaveTextContent(`${command} setup`)
  })

  it("does not open again once seen", () => {
    // Given
    localStorage.setItem(StoreKey.AGENT_PROMO_SEEN, "true")

    // When
    renderComponent(<AgentPromoModal />)

    // Then
    expect(queryHook("agent-promo")).toBeNull()
  })

  it("does not open over a link that connects an agent", () => {
    // Given
    history.replaceState(null, "", "/?mcp-pair=1")

    // When
    renderComponent(<AgentPromoModal />)

    // Then it stays closed and stays unseen
    expect(queryHook("agent-promo")).toBeNull()
    expect(localStorage.getItem(StoreKey.AGENT_PROMO_SEEN)).toBeNull()
  })

  it("closes once an agent connects", () => {
    // Given
    const { rerender } = renderComponent(<AgentPromoModal />)
    expect(getHook("agent-promo")).toBeVisible()

    // When
    bridge.status = "connected"
    rerender(<AgentPromoModal />)

    // Then
    expect(queryHook("agent-promo")).toBeNull()
  })

  it("names the chosen agent in the command that works in the AI Assistant, and only there", () => {
    // Given
    renderComponent(<AgentPromoModal />)

    // When an agent is chosen from the keyboard
    fireEvent.click(getHook("agent-promo-agent-codex"))

    // Then
    expect(getHook("agent-promo-agent-codex")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(getHook("agent-promo-works-with")).toHaveTextContent("Codex")
    expect(connectCommand()).toHaveTextContent(
      `${command} connect http://localhost:3000--agent codex`,
    )
    expect(terminalOption()).not.toHaveTextContent("--agent")
    expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.AGENT_PROMO_AGENT, {
      agent: "codex",
    })

    // When it is chosen again, it lets go
    fireEvent.click(getHook("agent-promo-agent-codex"))

    // Then
    expect(getHook("agent-promo-agent-codex")).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("shows the agents in turn while nobody points at them", () => {
    // Given
    vi.useFakeTimers()
    renderComponent(<AgentPromoModal />)
    expect(getHook("agent-promo-works-with")).toHaveTextContent(
      "Claude Code, Codex and more",
    )

    // When the gallery starts, then takes a turn
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    const first = connectCommand().textContent
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Then it shows Claude Code, then Codex
    expect(first).toContain("--agent claude")
    expect(getHook("agent-promo-works-with")).toHaveTextContent("Codex")
    expect(connectCommand()).toHaveTextContent("--agent codex")
  })

  it("holds the gallery while the user is at the commands, so the command they copy stays put", () => {
    // Given the gallery shows Claude Code
    vi.useFakeTimers()
    renderComponent(<AgentPromoModal />)
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(connectCommand()).toHaveTextContent("--agent claude")

    // When the pointer is at the commands for a while
    fireEvent.pointerEnter(getHook("agent-promo-ways"))
    act(() => {
      vi.advanceTimersByTime(6000)
    })

    // Then the command still names Claude Code
    expect(connectCommand()).toHaveTextContent("--agent claude")

    // When it leaves, the gallery goes on
    fireEvent.pointerLeave(getHook("agent-promo-ways"))
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Then
    expect(connectCommand()).toHaveTextContent("--agent codex")
  })

  it("holds the gallery while focus is on a command's copy button", () => {
    // Given the gallery shows Claude Code
    vi.useFakeTimers()
    renderComponent(<AgentPromoModal />)
    act(() => {
      vi.advanceTimersByTime(1200)
    })

    // When the copy button takes focus, as from the keyboard
    const copy = connectCommand().querySelector("button")
    expect(copy).not.toBeNull()
    act(() => copy?.focus())
    act(() => {
      vi.advanceTimersByTime(6000)
    })

    // Then the command still names Claude Code
    expect(connectCommand()).toHaveTextContent("--agent claude")
  })

  it("jumps the demo to a feature, and follows the demo when it moves on", () => {
    // Given
    renderComponent(<AgentPromoModal />)
    const analysis = getHook("agent-promo-feature-analysis")
    const monitoring = getHook("agent-promo-feature-monitoring")

    // When a feature is chosen
    fireEvent.click(analysis)

    // Then the demo jumps to it
    expect(scene.jumps).toEqual(["analysis"])
    expect(analysis).toHaveAttribute("aria-pressed", "true")
    expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.AGENT_PROMO_FLOW, {
      flow: "analysis",
    })

    // When the demo moves on by itself
    act(() => scene.onFlow?.("monitoring"))

    // Then the feature list follows
    expect(monitoring).toHaveAttribute("aria-pressed", "true")
    expect(analysis).toHaveAttribute("aria-pressed", "false")
  })
})
