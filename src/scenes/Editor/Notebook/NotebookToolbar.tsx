import React, { useEffect, useRef, useState } from "react"
import styled, { css } from "styled-components"
import { Box, Button, Tooltip } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import {
  DownloadSimpleIcon,
  ListIcon,
  NotebookIcon,
  PencilSimpleLineIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react"
import { CopyAlt } from "@styled-icons/boxicons-regular"
import { color } from "../../../utils"
import { toast } from "../../../components/Toast"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { exportBuffers } from "../Monaco/exportTabs"
import { useNotebookActions, useNotebookState } from "./NotebookProvider"
import type { NotebookLayoutMode } from "../../../store/notebook"
import { MAX_BUFFER_NAME_LENGTH } from "../../../store/buffers"
import { useEditor } from "../../../providers/EditorProvider"
import { useAIConversationActions } from "../../../providers/AIConversationProvider"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { emitUserAction } from "../../../utils/notebooks/notebookAIBridge"
import { VariablesPopover } from "./globals/VariablesPopover"

const Toolbar = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  padding: 0.8rem 2.5rem;
  background: ${color("midnight")};
  border-bottom: 1px solid ${color("baseGrey")};
  box-shadow: 0 2px 10px 0 rgba(23, 23, 23, 0.35);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
`

const NotebookGlyph = styled(NotebookIcon)`
  flex-shrink: 0;
  color: ${color("pinkPrimary")};
`

const TitleContainer = styled(Box).attrs({ align: "center", gap: "0.5rem" })`
  min-width: 0;
`

const Name = styled.span`
  min-width: 0;
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: -0.32px;
  color: ${color("foreground")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const NameInput = styled.input`
  min-width: 0;
  font-family: inherit;
  font-size: 1.6rem;
  font-weight: 600;
  color: ${color("foreground")};
  background: transparent;
  border: 1px solid ${color("pinkDarker")};
  border-radius: 4px;
  outline: none;
  padding: 0.2rem 0.6rem;

  &::selection {
    background: ${color("pinkPrimary")};
  }
`

const EditButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0.3rem;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: ${color("gray2")};
  cursor: pointer;

  &:hover {
    color: ${color("foreground")};
    background: ${color("selection")};
  }
`

// Mirrors SchemaAIButton's skin; kept inline because SchemaAIButton carries schema-access gating that doesn't apply here.
const BuildWithAIButton = styled(Button).attrs({ skin: "gradient" })`
  border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  &:hover:not([disabled]) {
    border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  }
  &:disabled {
    svg {
      filter: grayscale(100%);
    }
  }
`

const TooltipButton: React.FC<{
  tooltip: string
  children: React.ReactNode
}> = ({ tooltip, children }) => (
  // The span keeps the tooltip working while the button is disabled (a
  // disabled button receives no pointer events of its own).
  <Tooltip content={tooltip}>
    <span style={{ display: "inline-flex" }}>{children}</span>
  </Tooltip>
)

const ToggleGroup = styled.div`
  display: flex;
  gap: 2px;
  padding: 3px;
  background: ${color("backgroundLighter")};
  border: 1px solid rgba(68, 71, 90, 0.5);
  border-radius: 0.4rem;
`

const ToggleButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0 2rem;
  height: 3rem;
  font-size: 1.4rem;
  border: none;
  background: transparent;
  color: ${color("gray2")};
  cursor: pointer;
  transition: all 0.1s;
  border-radius: 0.4rem;

  &:hover {
    background: ${color("selectionDarker")};
    color: ${color("foreground")};
  }

  ${({ $active }) =>
    $active &&
    css`
      background: ${color("selection")};
      color: ${color("foreground")};
      &:hover {
        background: ${color("selection")};
      }
    `}
`

export const NotebookToolbar: React.FC = () => {
  const { settings } = useNotebookState()
  const { updateSettings } = useNotebookActions()
  const { activeBuffer, buffers, duplicateNotebook, updateBuffer } = useEditor()
  const { openNotebookChat } = useAIConversationActions()
  const { canUse, status: aiStatus } = useAIStatus()
  const isOperationInProgress = isBlockingAIStatus(aiStatus)
  const mode: NotebookLayoutMode = settings.layoutMode ?? "list"
  const hasBuffer = typeof activeBuffer.id === "number"
  // activeBuffer is a cached snapshot that updateBuffer doesn't refresh; read the
  // label from the live buffers query so a rename shows immediately.
  const label =
    buffers.find((b) => b.id === activeBuffer.id)?.label ??
    activeBuffer.label ??
    ""
  const aiTooltip = !canUse
    ? "AI Assistant is not configured"
    : isOperationInProgress
      ? "An operation is in progress"
      : "Build with AI"

  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  // Set when the rename is cancelled (Escape) so the resulting blur discards.
  const cancelRenameRef = useRef(false)
  // The buffer being renamed, captured at start: the active buffer can change
  // mid-rename (e.g. an agent activating another notebook), and commit must
  // still target the notebook the user actually edited.
  const renameTargetRef = useRef<{ id: number; label: string } | null>(null)

  useEffect(() => {
    if (isRenaming) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [isRenaming])

  const startRename = () => {
    if (typeof activeBuffer.id !== "number") return
    renameTargetRef.current = { id: activeBuffer.id, label }
    setDraftName(label)
    setIsRenaming(true)
  }

  // Blur is the single commit path: Enter/Escape both blur the input.
  const commitRename = () => {
    setIsRenaming(false)
    const target = renameTargetRef.current
    renameTargetRef.current = null
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false
      return
    }
    if (!target) return
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === target.label) return
    void trackEvent(ConsoleEvent.TAB_RENAME)
    void updateBuffer(target.id, { label: trimmed })
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      nameInputRef.current?.blur()
    } else if (e.key === "Escape") {
      cancelRenameRef.current = true
      nameInputRef.current?.blur()
    }
  }

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

  const handleDuplicate = () => {
    if (typeof activeBuffer.id !== "number") return
    void duplicateNotebook(activeBuffer.id)
  }

  const handleExport = () => {
    if (typeof activeBuffer.id !== "number") return
    void trackEvent(ConsoleEvent.TAB_EXPORT, { type: "notebook" })
    exportBuffers({ bufferId: activeBuffer.id }).catch((err) => {
      toast.error(
        `Failed to export notebook: ${err instanceof Error ? err.message : "Unknown error"}`,
      )
    })
  }

  return (
    <Toolbar>
      <Box align="center" gap="1rem">
        <NotebookGlyph size={20} weight="fill" />
        {isRenaming ? (
          <NameInput
            ref={nameInputRef}
            value={draftName}
            maxLength={MAX_BUFFER_NAME_LENGTH}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={commitRename}
            aria-label="Notebook name"
            data-hook="notebook-rename-input"
          />
        ) : (
          <TitleContainer>
            <Name title={label}>{label}</Name>
            {hasBuffer && (
              <Tooltip content="Rename notebook">
                <EditButton
                  onClick={startRename}
                  aria-label="Rename notebook"
                  data-hook="notebook-rename"
                >
                  <PencilSimpleLineIcon size={16} />
                </EditButton>
              </Tooltip>
            )}
          </TitleContainer>
        )}
      </Box>
      <Box align="center" gap="0.8rem">
        <TooltipButton tooltip={aiTooltip}>
          <BuildWithAIButton
            disabled={!canUse || isOperationInProgress || !hasBuffer}
            onClick={handleBuildWithAI}
            aria-label="Build with AI"
          >
            <AISparkle size={18} variant="hollow" />
          </BuildWithAIButton>
        </TooltipButton>
        <TooltipButton tooltip="Duplicate notebook">
          <Button
            skin="secondary"
            disabled={!hasBuffer}
            onClick={handleDuplicate}
            aria-label="Duplicate notebook"
          >
            <CopyAlt size={18} />
          </Button>
        </TooltipButton>
        <TooltipButton tooltip="Export notebook">
          <Button
            skin="secondary"
            disabled={!hasBuffer}
            onClick={handleExport}
            aria-label="Export notebook"
          >
            <DownloadSimpleIcon size={18} />
          </Button>
        </TooltipButton>
        <VariablesPopover />
        <ToggleGroup>
          <ToggleButton
            $active={mode === "list"}
            onClick={() => handleModeChange("list")}
            title="List layout"
          >
            <ListIcon size={18} />
            List
          </ToggleButton>
          <ToggleButton
            $active={mode === "grid"}
            onClick={() => handleModeChange("grid")}
            title="Grid layout"
          >
            <SquaresFourIcon size={18} />
            Grid
          </ToggleButton>
        </ToggleGroup>
      </Box>
    </Toolbar>
  )
}
