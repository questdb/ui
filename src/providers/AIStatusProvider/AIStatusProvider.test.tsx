// @vitest-environment jsdom
import React from "react"
import { act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  configuredOpenAI,
  renderAISettings,
} from "../../components/SetupAIAssistant/test/setupHarness"
import { LOCAL_AGENT_MODEL } from "../../utils/localAgent/localAgentModel"
import { AIOperationStatus, useAIStatus } from "."

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

  it("does not fall back to a cloud model while a disconnected local agent is selected", () => {
    const status = renderStatus({
      ...configuredOpenAI,
      selectedModel: LOCAL_AGENT_MODEL,
    })
    expect(status().currentModel).toBeNull()
    expect(status().canUse).toBe(false)
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
