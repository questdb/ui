// @vitest-environment jsdom
import React from "react"
import { expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import {
  editorAdapter,
  getByHook,
  openChat,
  queryByHook,
  renderChat,
  seedChat,
} from "./support/chatHarness"
import type { EditorContext } from "../../../src/providers/EditorProvider"
import { Type } from "../../../src/utils/questdb/types"
import { useAIConversationActions } from "../../../src/providers/AIConversationProvider"
import { createQueryKey } from "../../../src/scenes/Editor/Monaco/utils"
import { Button } from "../../../src/components/Button"
import { TableDetailsButton } from "../../../src/scenes/Layout/TableDetailsButton"

it("handles Explain only while a query chat has a mounted action", async () => {
  const Trigger = () => {
    const { handleGlyphClick } = useAIConversationActions()
    return (
      <>
        <Button
          onClick={() =>
            void handleGlyphClick({
              bufferId: 1,
              queryKey: createQueryKey("SELECT 1", 0),
            })
          }
        >
          Open query chat
        </Button>
        <input aria-label="Outside chat" />
        <TableDetailsButton />
      </>
    )
  }
  renderChat("openai", <Trigger />)
  const outside = screen.getByLabelText("Outside chat")
  const pressExplain = (expected: boolean) => {
    for (const modifier of ["metaKey", "ctrlKey"] as const) {
      const event = new KeyboardEvent("keydown", {
        key: "e",
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      })
      expect(fireEvent(outside, event)).toBe(!expected)
      expect(event.defaultPrevented).toBe(expected)
    }
  }
  pressExplain(false)
  fireEvent.click(screen.getByRole("button", { name: "Open query chat" }))
  await waitFor(() => expect(getByHook("button-explain-query")).toBeVisible())
  const launch = vi.fn((event: Event) => event.stopImmediatePropagation())
  getByHook("button-explain-query").addEventListener("click", launch)
  pressExplain(true)
  expect(launch).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "Table details" }))
  await waitFor(() =>
    expect(queryByHook("ai-chat-window")).not.toBeInTheDocument(),
  )
  pressExplain(false)
  expect(launch).toHaveBeenCalledTimes(2)
  expect(fetch).not.toHaveBeenCalled()
})

it.each([1, 2])(
  "uses the original tab's error for Fix (active buffer %s)",
  async (activeId) => {
    const sql = "SELECT missing"
    const queryKey = createQueryKey(sql, 0)
    const getModel = vi.fn(() => ({
      getPositionAt: (offset: number) => ({
        lineNumber: 1,
        column: offset + 1,
      }),
      getWordAtPosition: () => ({ word: "missing" }),
      getValueInRange: () => sql,
    }))
    editorAdapter.overrides = {
      activeBuffer: { id: activeId, value: sql, position: 0, label: "Query" },
      editorRef: {
        current: { getModel },
      } as unknown as EditorContext["editorRef"],
      executionRefs: {
        current: {
          1: {
            [queryKey]: {
              error: {
                type: Type.ERROR,
                error: "Invalid column",
                position: 7,
                query: sql,
              },
              queryText: sql,
              startOffset: 0,
              endOffset: sql.length,
              selection: { startOffset: 0, endOffset: sql.length },
            },
          },
        },
      },
    }
    await seedChat("Query with an error", {
      bufferId: 1,
      queryKey,
      currentSQL: sql,
      messages: [],
    })
    renderChat()
    await openChat()
    expect(getByHook("button-explain-query")).toBeVisible()
    if (activeId === 1) {
      expect(getByHook("button-fix-query")).toBeVisible()
    } else {
      expect(queryByHook("button-fix-query")).not.toBeInTheDocument()
      expect(getModel).not.toHaveBeenCalled()
    }
  },
)
