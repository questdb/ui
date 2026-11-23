// @vitest-environment jsdom
import React, { useState } from "react"
import { act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LocalAgentChannel } from "../../utils/localAgent/localAgentChannel"
import { LocalAgentContext } from "../../utils/localAgent/LocalAgentContext"
import type { MCPBridgeClient } from "../../utils/mcp/MCPBridgeClient"
import {
  configuredOpenAI,
  renderAISettings,
} from "../../components/SetupAIAssistant/test/setupHarness"
import { LOCAL_AGENT_MODEL } from "../../utils/localAgent/localAgentModel"
import { AIOperationStatus, AIStatusProvider, useAIStatus } from "."

type Status = ReturnType<typeof useAIStatus>

const renderStatus = (settings?: Parameters<typeof renderAISettings>[1]) => {
  const probe: { current: Status | null } = { current: null }
  const Probe = () => {
    probe.current = useAIStatus()
    return null
  }
  renderAISettings(<Probe />, settings)
  return () => probe.current!
}

describe("AIStatusProvider", () => {
  it("disables sending when the selected local agent is gone and no cloud model is enabled", () => {
    const status = renderStatus({
      ...configuredOpenAI,
      selectedModel: LOCAL_AGENT_MODEL,
      providers: {
        openai: { ...configuredOpenAI.providers.openai, enabledModels: [] },
      },
    })
    expect(status().currentModel).toBeNull()
    expect(status().canUse).toBe(false)
  })

  it("answers on the API model while the selected local agent is offline, and on the agent once it is back", () => {
    // Given the local agent is selected but not connected
    let connect: (channel: LocalAgentChannel) => void = () => undefined
    const probe: { current: Status | null } = { current: null }
    const Probe = () => {
      probe.current = useAIStatus()
      return null
    }
    const Bridge = () => {
      const [channel, setChannel] = useState<LocalAgentChannel | null>(null)
      connect = setChannel
      return (
        <LocalAgentContext.Provider value={channel}>
          <AIStatusProvider>
            <Probe />
          </AIStatusProvider>
        </LocalAgentContext.Provider>
      )
    }
    renderAISettings(<Bridge />, {
      ...configuredOpenAI,
      selectedModel: LOCAL_AGENT_MODEL,
    })

    // Then the configured API model answers, with its own schema access
    expect(probe.current).toMatchObject({
      canUse: true,
      currentModel: "openai:gpt-5.4",
      apiKey: "test-openai-key",
      hasSchemaAccess: false,
    })

    // When the agent connects
    act(() =>
      connect(
        new LocalAgentChannel(
          {
            on: () => () => undefined,
            sendAgentMessage: () => true,
          } as unknown as MCPBridgeClient,
          {
            info: { id: "claude", label: "Claude Code", cwd: "/tmp" },
            onNotebookRead: () => undefined,
          },
        ),
      ),
    )

    // Then the agent answers again, without the user picking it
    expect(probe.current).toMatchObject({
      canUse: true,
      currentModel: LOCAL_AGENT_MODEL,
    })
  })

  it("exposes model and key as strings when the configured assistant is usable", () => {
    const current = renderStatus(configuredOpenAI)()
    expect(current.canUse).toBe(true)
    if (current.canUse) {
      const model: string = current.currentModel
      const key: string = current.apiKey
      expect(model).toContain("openai:")
      expect(key).not.toBe("")
    }
  })

  it("acquires Stop for a new turn despite a matching retained Processing step", () => {
    const status = renderStatus()
    act(() => {
      status().setStatus(AIOperationStatus.Processing)
      status().setStatus(null)
    })
    const previous = status().currentOperation[0]
    const nextSignal = status().getOperationSignal()
    act(() => status().setStatus(AIOperationStatus.Processing))
    expect(status().isOperationBlocking()).toBe(true)
    expect(status().currentOperation).toHaveLength(1)
    expect(status().currentOperation[0]).not.toBe(previous)
    act(() => status().abortOperation())
    expect(nextSignal.aborted).toBe(true)
  })

  it("starts a retried answer over from the steps it showed before its first attempt", () => {
    // Given an attempt that showed a tool step and text before it failed
    const status = renderStatus()
    act(() => {
      status().setStatus(AIOperationStatus.Processing)
      status().setStatus(AIOperationStatus.RetrievingTables)
      status().setStatus(AIOperationStatus.GeneratingResponse)
    })

    // When the retry starts
    act(() => {
      status().setStatus(AIOperationStatus.Processing, { truncateTo: 1 })
    })

    // Then
    expect(status().currentOperation.map((entry) => entry.type)).toEqual([
      AIOperationStatus.Processing,
    ])
  })

  it("marks only the very step that failed, and adds a failed step when there is none", () => {
    // Given
    const status = renderStatus()
    act(() => {
      status().setStatus(AIOperationStatus.InvestigatingTable, {
        name: "trades",
      })
    })

    // When another table's lookup fails
    act(() => {
      status().setStatus(AIOperationStatus.InvestigatingTable, {
        name: "fx",
        failed: "Table not found",
      })
    })

    // Then
    expect(status().currentOperation.map((entry) => entry.args)).toEqual([
      { name: "trades" },
      { name: "fx", failed: "Table not found" },
    ])
  })

  it("updates a step in place to its new details", () => {
    // Given two runs of a command that started as "bash"
    const status = renderStatus()
    act(() => {
      status().setStatus(AIOperationStatus.UsingAgentTools, {
        name: "bash",
        callId: "a",
      })
      status().setStatus(AIOperationStatus.UsingAgentTools, {
        name: "bash",
        callId: "b",
      })
    })

    // When the first one's command arrives
    act(() => {
      status().setStatus(AIOperationStatus.UsingAgentTools, {
        name: "ls",
        callId: "a",
        replaces: { name: "bash", callId: "a" },
      })
    })

    // Then
    expect(status().currentOperation.map((entry) => entry.args)).toEqual([
      { name: "ls", callId: "a" },
      { name: "bash", callId: "b" },
    ])
  })

  it("keeps separate records and outcomes for equal local query statuses", async () => {
    const status = renderStatus()
    const client = {
      on: () => () => undefined,
      sendAgentMessage: () => true,
    } as unknown as MCPBridgeClient
    const channel = new LocalAgentChannel(client, {
      info: { id: "test", label: "Sample agent", cwd: "/tmp" },
      onNotebookRead: () => undefined,
    })
    const conversationId = "sample-chat"
    const turn = channel.prompt({
      conversationId,
      text: "Run the sample twice",
      notebookRead: null,
      onUpdate: () => undefined,
      onToolStatus: (type, args) => status().setStatus(type, args),
    })
    try {
      const query = AIOperationStatus.RunningQuery
      const args = { content: "SELECT 1" }
      const reportFirst = channel.captureToolRequest(
        client,
        conversationId,
      )?.setStatus
      const reportSecond = channel.captureToolRequest(
        client,
        conversationId,
      )?.setStatus
      act(() => {
        reportFirst?.(query, args)
        reportFirst?.(query, { ...args, ended: true })
        status().setStatus(query, { transient: true })
        reportSecond?.(query, args)
        reportSecond?.(query, { ...args, failed: "Sample query failed" })
      })
      const entries = status().currentOperation
      expect(entries).toHaveLength(2)
      expect(entries.map((entry) => entry.type)).toEqual([query, query])
      expect(entries.map((entry) => entry.args?.content)).toEqual([
        args.content,
        args.content,
      ])
      expect(entries.map((entry) => entry.args?.failed)).toEqual([
        undefined,
        "Sample query failed",
      ])
      expect(entries.every((entry) => entry.endedAt !== undefined)).toBe(true)
    } finally {
      channel.dispose()
      await turn
    }
  })

  it("records when a step's tool finished, without adding a step", () => {
    // Given
    const status = renderStatus()
    act(() => {
      status().setStatus(AIOperationStatus.Processing)
      status().setStatus(AIOperationStatus.RunningQuery, { content: "q1" })
    })

    // When
    act(() => {
      status().setStatus(AIOperationStatus.RunningQuery, {
        content: "q1",
        ended: true,
      })
    })

    // Then
    const steps = status().currentOperation
    expect(steps).toHaveLength(2)
    expect(steps[1].args).toEqual({ content: "q1" })
    expect(steps[1].endedAt).toBeGreaterThanOrEqual(steps[1].timestamp)
  })
})
