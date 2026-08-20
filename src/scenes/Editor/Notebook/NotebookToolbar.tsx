import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Box, Button, IconButton, Tooltip } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import {
  DownloadSimpleIcon,
  NotebookIcon,
  PencilSimpleLineIcon,
} from "@phosphor-icons/react"
import { CopyAlt } from "../../../components/icons"
import { Spinner } from "./cells/Spinner"
import { color } from "../../../utils"
import { toast } from "../../../components/Toast"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { exportBuffers } from "../Monaco/exportTabs"
import { useNotebookActions, useNotebookState } from "./NotebookProvider"
import type { NotebookLayoutMode } from "../../../store/notebook"
import { BufferType, MAX_BUFFER_NAME_LENGTH } from "../../../store/buffers"
import { useEditor } from "../../../providers/EditorProvider"
import { useAIConversationActions } from "../../../providers/AIConversationProvider"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { emitUserAction } from "../../../utils/notebooks/notebookAIBridge"
import { VariablesPopover } from "./globals/VariablesPopover"
import { NotebookRefreshControl } from "./NotebookRefreshControl"
import { NotebookLayoutToggle } from "./NotebookViewToggle"
import { NotebookRenameInput } from "./NotebookRenameInput"

const Toolbar = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 1rem;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 6.4rem;
  box-sizing: border-box;
  padding: 1rem 2rem;
  background: ${color("surfaceBase")};
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  box-shadow: 0 12px 24px ${({ theme }) => theme.color.shadowSoft};
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  overflow-x: auto;
  overflow-y: hidden;

  & > * {
    flex-shrink: 0;
  }
`

const NotebookGlyph = styled(NotebookIcon).attrs({
  size: 20,
  weight: "regular",
})`
  display: block;
  flex-shrink: 0;
  color: ${color("contentObject")};
`

const NotebookIdentity = styled(Box).attrs({ align: "center", gap: "1rem" })`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
`

const TitleContainer = styled(Box).attrs({ align: "center", gap: "0.5rem" })`
  min-width: 0;
  max-width: 100%;
  min-height: 3.2rem;
  overflow: hidden;
  line-height: 1;
`

const Name = styled.span`
  display: block;
  min-width: 0;
  max-width: 40rem;
  font-size: 1.6rem;
  font-weight: 600;
  color: ${color("contentPrimary")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  padding-top: 0.1rem;
`

const ToolbarRenameInput = styled(NotebookRenameInput)`
  flex: 1 1 auto;
  width: 0;
  max-width: 40rem;
`

const ToolbarActions = styled(Box).attrs({ align: "center", gap: "0.8rem" })`
  flex: 0 0 auto;
  min-width: max-content;
  justify-self: end;
`

const EditButton = styled(IconButton).attrs({
  label: "Rename notebook",
  variant: "ghost",
  size: "sm",
})`
  flex-shrink: 0;
  padding: 0.3rem;
`

const BuildWithAIButton = styled(Button).attrs({ variant: "gradient" })`
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

export const NotebookToolbar: React.FC = () => {
  const { cells, settings } = useNotebookState()
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
  const isArchived =
    buffers.find((b) => b.id === activeBuffer.id)?.archived ??
    !!activeBuffer.archived
  const aiTooltip = !canUse
    ? "AI Assistant is not configured"
    : isOperationInProgress
      ? "An operation is in progress"
      : "Build with AI"

  const [isRenaming, setIsRenaming] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [draftName, setDraftName] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const isMountedRef = useRef(true)
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

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

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
    void trackEvent(ConsoleEvent.TAB_RENAME, { type: BufferType.NOTEBOOK })
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
    void trackEvent(ConsoleEvent.NOTEBOOK_LAYOUT_MODE_CHANGE, { to: next })
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
    void trackEvent(ConsoleEvent.NOTEBOOK_BUILD_WITH_AI, {
      cellCount: cells.length,
    })
    void openNotebookChat(activeBuffer.id)
  }

  const handleDuplicate = async () => {
    if (typeof activeBuffer.id !== "number" || isArchived || isDuplicating)
      return
    void trackEvent(ConsoleEvent.NOTEBOOK_DUPLICATE, {
      cellCount: cells.length,
      layoutMode: mode,
    })
    setIsDuplicating(true)
    try {
      await duplicateNotebook(activeBuffer.id)
    } finally {
      if (isMountedRef.current) setIsDuplicating(false)
    }
  }

  const handleExport = () => {
    if (typeof activeBuffer.id !== "number") return
    void trackEvent(ConsoleEvent.TAB_EXPORT, { type: BufferType.NOTEBOOK })
    exportBuffers({ bufferId: activeBuffer.id }).catch((err) => {
      toast.error(
        `Failed to export notebook: ${err instanceof Error ? err.message : "Unknown error"}`,
      )
    })
  }

  return (
    <Toolbar data-hook="notebook-toolbar">
      <NotebookIdentity data-hook="notebook-toolbar-identity">
        <NotebookGlyph aria-hidden="true" />
        {isRenaming ? (
          <ToolbarRenameInput
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
            <Name title={label} data-hook="notebook-toolbar-name">
              {label}
            </Name>
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
      </NotebookIdentity>
      <ToolbarActions data-hook="notebook-toolbar-actions">
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
            variant="secondary"
            disabled={!hasBuffer || isArchived || isDuplicating}
            onClick={() => void handleDuplicate()}
            aria-label="Duplicate notebook"
            aria-busy={isDuplicating}
          >
            {isDuplicating ? (
              <Spinner size={18} style={{ opacity: 0.5 }} />
            ) : (
              <CopyAlt size={18} />
            )}
          </Button>
        </TooltipButton>
        <TooltipButton tooltip="Export notebook">
          <Button
            variant="secondary"
            disabled={!hasBuffer}
            onClick={handleExport}
            aria-label="Export notebook"
          >
            <DownloadSimpleIcon size={18} />
          </Button>
        </TooltipButton>
        <VariablesPopover />
        <NotebookRefreshControl />
        <NotebookLayoutToggle
          mode={mode}
          onChange={handleModeChange}
          ariaLabel="Notebook layout"
        />
      </ToolbarActions>
    </Toolbar>
  )
}
