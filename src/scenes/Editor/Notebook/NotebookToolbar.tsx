import React from "react"
import styled, { css } from "styled-components"
import { Box, Button } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { ListIcon, SquaresFourIcon } from "@phosphor-icons/react"
import { color } from "../../../utils"
import { useNotebookActions, useNotebookState } from "./NotebookProvider"
import type { NotebookLayoutMode } from "../../../store/notebook"
import { useEditor } from "../../../providers/EditorProvider"
import { useAIConversation } from "../../../providers/AIConversationProvider"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { emitUserAction } from "../../../utils/notebookAIBridge"

const Toolbar = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  height: 4.5rem;
  padding: 0 2.5rem;
  background: ${color("backgroundLighter")};
  border-bottom: 1px solid ${color("backgroundDarker")};
  box-shadow: 0 2px 10px 0 rgba(23, 23, 23, 0.35);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
`

// Mirrors SchemaAIButton's skin; kept inline because SchemaAIButton carries schema-access gating that doesn't apply here.
const BuildWithAIButton = styled(Button).attrs({
  skin: "gradient",
  prefixIcon: <AISparkle size={14} variant="hollow" />,
})`
  border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  &:hover:not([disabled]) {
    border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  }
`

const ToggleGroup = styled.div`
  display: flex;
  border: 1px solid ${color("selection")};
  border-radius: 0.4rem;
  overflow: hidden;
`

const ToggleButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 2.8rem;
  border: none;
  background: transparent;
  color: ${color("gray2")};
  cursor: pointer;
  transition: all 0.1s;

  &:not(:last-child) {
    border-right: 1px solid ${color("selection")};
  }

  &:hover {
    background: ${color("selection")};
    color: ${color("foreground")};
  }

  ${({ $active }) =>
    $active &&
    css`
      background: ${color("selection")};
      color: ${color("foreground")};
    `}
`

export const NotebookToolbar: React.FC = () => {
  const { settings } = useNotebookState()
  const { updateSettings } = useNotebookActions()
  const { activeBuffer } = useEditor()
  const { openNotebookChat } = useAIConversation()
  const { canUse, status: aiStatus } = useAIStatus()
  const isOperationInProgress = isBlockingAIStatus(aiStatus)
  const mode: NotebookLayoutMode = settings.layoutMode ?? "list"

  // User-origin only: tool-driven set_layout_mode bypasses this handler so it doesn't appear in the AI digest.
  const handleModeChange = (next: NotebookLayoutMode) => {
    if (next === mode) return
    updateSettings({ layoutMode: next })
    if (typeof activeBuffer.id === "number") {
      emitUserAction({
        kind: "user_changed_layout_mode",
        bufferId: activeBuffer.id,
        mode: next,
      })
    }
  }

  const handleBuildWithAI = () => {
    if (typeof activeBuffer.id !== "number") return
    void openNotebookChat(activeBuffer.id)
  }

  return (
    <Toolbar>
      <BuildWithAIButton
        disabled={
          !canUse ||
          isOperationInProgress ||
          typeof activeBuffer.id !== "number"
        }
        disabledTooltip={
          !canUse
            ? "AI Assistant is not configured"
            : isOperationInProgress
              ? "An operation is in progress"
              : undefined
        }
        onClick={handleBuildWithAI}
        title="Open AI chat for this notebook"
      >
        Build with AI
      </BuildWithAIButton>
      <ToggleGroup>
        <ToggleButton
          $active={mode === "list"}
          onClick={() => handleModeChange("list")}
          title="List layout"
        >
          <ListIcon size={18} />
        </ToggleButton>
        <ToggleButton
          $active={mode === "grid"}
          onClick={() => handleModeChange("grid")}
          title="Grid layout"
        >
          <SquaresFourIcon size={18} />
        </ToggleButton>
      </ToggleGroup>
    </Toolbar>
  )
}
