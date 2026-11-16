// @vitest-environment jsdom
import { renderChat, getByHook, queryByHook } from "./support/chatHarness"
import React from "react"
import { Button } from "../../../src/components/Button"
import { expect, it, vi } from "vitest"
import { act, fireEvent, screen } from "@testing-library/react"
import { AIStatusIndicator } from "../../../src/components/AIStatusIndicator"
import {
  AIOperationStatus,
  useAIStatus,
} from "../../../src/providers/AIStatusProvider"

const StartOperation = () => {
  const { setStatus } = useAIStatus()
  return (
    <Button onClick={() => setStatus(AIOperationStatus.Processing)}>
      Start operation
    </Button>
  )
}

it("dismisses the cancelled status after two seconds", async () => {
  // Given
  renderChat(
    "openai",
    <>
      <StartOperation />
      <AIStatusIndicator />
    </>,
  )
  vi.useRealTimers()
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole("button", { name: "Start operation" }))
  expect(getByHook("ai-status-indicator")).toBeInTheDocument()

  // When
  fireEvent.click(
    screen.getByRole("button", { name: "Cancel current AI operation" }),
  )

  // Then
  expect(getByHook("ai-status-text")).toHaveTextContent("Cancelled")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999)
  })
  expect(getByHook("ai-status-indicator")).toBeInTheDocument()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(queryByHook("ai-status-indicator")).not.toBeInTheDocument()
})
