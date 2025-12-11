import React, { useCallback, useState, useContext, useEffect } from "react"
import styled, { css } from "styled-components"
import { Button, Box, Dialog, ForwardRef, Overlay, Key } from "../../components"
import { color, platform } from "../../utils"
import { pinkLinearGradientVertical } from "../../theme"
import { useSelector } from "react-redux"
import { useEditor } from "../../providers/EditorProvider"
import {
  continueConversation,
  createModelToolsClient,
  isAiAssistantError,
  generateChatTitle,
  type ActiveProviderSettings,
} from "../../utils/aiAssistant"
import {
  providerForModel,
  MODEL_OPTIONS,
} from "../../utils/aiAssistantSettings"
import { toast } from "../Toast"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { RunningType } from "../../store/Query/types"
import {
  useAIStatus,
  isBlockingAIStatus,
} from "../../providers/AIStatusProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })<{
  $disabled: boolean
}>`
  margin-left: 1rem;
  color: ${({ theme }) => theme.color.pinkPrimary};
  ${({ $disabled, theme }) =>
    $disabled &&
    css`
      color: ${theme.color.gray1};
    `}
`

const StyledDialogTitle = styled(Dialog.Title)`
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 2rem;
  font-weight: 500;
`

const StyledDialogDescription = styled(Dialog.Description)`
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.gray2};
  line-height: 1.5;
  padding: 0;
  margin-bottom: 0;
`

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin: 0 2rem;
`

const StyledDialogButton = styled(Button)`
  padding: 1.2rem 1.6rem;
  font-size: 1.4rem;

  &:focus {
    outline: 1px solid ${({ theme }) => theme.color.foreground};
  }
`

const StyledTextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 1rem;
  background: ${({ theme }) => theme.color.background};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  resize: vertical;
  outline: none;
  margin-bottom: 2rem;

  &:focus {
    background:
      linear-gradient(
          ${({ theme }) => theme.color.background},
          ${({ theme }) => theme.color.background}
        )
        padding-box,
      ${pinkLinearGradientVertical} border-box;
    border: 1px solid transparent;
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
    font-size: 1.3rem;
  }
`

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"
const shortcutTitle =
  platform.isMacintosh || platform.isIOS ? "Cmd+G" : "Ctrl+G"

export const GenerateSQLButton = () => {
  const { quest } = useContext(QuestContext)
  const { editorRef, activeBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const {
    status: aiStatus,
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess: hasSchemaAccessValue,
    currentModel,
    apiKey,
  } = useAIStatus()
  const {
    getOrCreateConversation,
    openChatWindow,
    addMessage,
    addMessageAndUpdateSQL,
    updateConversationName,
  } = useAIConversation()
  const [showDialog, setShowDialog] = useState(false)
  const [description, setDescription] = useState("")
  const disabled =
    running !== RunningType.NONE ||
    !editorRef.current ||
    isBlockingAIStatus(aiStatus)

  const handleGenerate = () => {
    setShowDialog(false)

    void (async () => {
      if (!canUse) {
        toast.error("No model selected for AI Assistant")
        return
      }

      // Create a temporary queryKey for generate flow (using description as query text)
      // When accepted, this will be replaced with the actual query's key
      const tempQueryKey =
        `${description}@-1--1` as import("../../scenes/Editor/Monaco/utils").QueryKey

      // Get or create conversation for this temporary queryKey
      getOrCreateConversation({
        queryKey: tempQueryKey,
        bufferId: activeBuffer.id, // Associate with current buffer
        originalQuery: description,
        initialSQL: "",
        initialExplanation: "",
      })

      // Build the full API message (sent to the model)
      const fullApiMessage = `For the following description, generate the corresponding QuestDB SQL query and 2-4 sentences explanation:\n\n\`\`\`\n${description}\n\`\`\``

      // Add the initial user message with display info for cleaner UI
      addMessage(tempQueryKey, {
        role: "user",
        content: fullApiMessage,
        timestamp: Date.now(),
        displayType: "generate_request",
        displayDescription: description,
      })

      // Open chat window immediately
      openChatWindow(tempQueryKey)

      // Clear description after opening chat
      setDescription("")

      // Now generate SQL in the background
      const provider = providerForModel(currentModel)
      const settings: ActiveProviderSettings = {
        model: currentModel,
        provider,
        apiKey,
      }

      // Generate chat title in parallel using test model
      const testModel = MODEL_OPTIONS.find(
        (m) => m.isTestModel && m.provider === provider,
      )
      if (testModel) {
        void generateChatTitle({
          firstUserMessage: fullApiMessage,
          settings: { model: testModel.value, provider, apiKey },
        }).then((title) => {
          if (title) {
            updateConversationName(tempQueryKey, title)
          }
        })
      }

      // For initial call, pass empty conversation history
      const response = await continueConversation({
        userMessage: fullApiMessage,
        conversationHistory: [],
        settings,
        modelToolsClient: createModelToolsClient(
          quest,
          hasSchemaAccessValue ? tables : undefined,
        ),
        setStatus,
        abortSignal: abortController?.signal,
        operation: "generate",
        queryKey: tempQueryKey,
      })

      if (isAiAssistantError(response)) {
        const error = response
        if (error.type !== "aborted") {
          toast.error(error.message, { autoClose: 10000 })
        }
        return
      }

      // For generate operation, response is GeneratedSQL type
      const result = response as {
        sql: string | null
        explanation?: string
        tokenUsage?: { inputTokens: number; outputTokens: number }
      }
      if (!result.sql) {
        toast.error("No query received from AI Assistant", { autoClose: 10000 })
        return
      }

      // Build complete assistant response content (SQL + explanation)
      // Note: The user message was already added before the API call for immediate UI feedback
      let assistantContent =
        result.explanation || "Query generated successfully"
      if (result.sql) {
        assistantContent = `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\`\n\nExplanation:\n${result.explanation || ""}`
      }

      // Only include sql field if there's an actual SQL change (not null/undefined/empty)
      const hasSQLInResult =
        result.sql !== undefined &&
        result.sql !== null &&
        result.sql.trim() !== ""
      addMessageAndUpdateSQL(
        tempQueryKey,
        {
          role: "assistant",
          content: assistantContent,
          timestamp: Date.now(),
          ...(hasSQLInResult && { sql: result.sql }),
          explanation: result.explanation,
          tokenUsage: result.tokenUsage,
        },
        result.sql,
        result.explanation || "",
      )
    })()
  }

  const handleOpenDialog = useCallback(() => {
    setShowDialog(true)
    setDescription("")
  }, [])

  const handleCloseDialog = useCallback(() => {
    setShowDialog(false)
    setDescription("")
  }, [])

  const handleGenerateQueryOpen = useCallback(
    (e?: KeyboardEvent) => {
      if (e) {
        if (!(e instanceof KeyboardEvent)) {
          return
        }
        if (!((e.metaKey || e.ctrlKey) && (e.key === "g" || e.key === "G"))) {
          return
        }
        e.preventDefault()
      }
      if (!disabled && canUse) {
        handleOpenDialog()
      }
    },
    [disabled, canUse, handleOpenDialog],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleGenerateQueryOpen)
    return () => {
      document.removeEventListener("keydown", handleGenerateQueryOpen)
    }
  }, [handleGenerateQueryOpen])

  useEffect(() => {
    eventBus.subscribe(EventType.GENERATE_QUERY_OPEN, handleGenerateQueryOpen)

    return () => {
      eventBus.unsubscribe(
        EventType.GENERATE_QUERY_OPEN,
        handleGenerateQueryOpen,
      )
    }
  }, [handleGenerateQueryOpen])

  const handleGenerateShortcut = useCallback(
    (e: KeyboardEvent) => {
      if (!showDialog) return
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        if (description.trim()) {
          void handleGenerate()
        }
      }
    },
    [showDialog, description, handleGenerate],
  )

  useEffect(() => {
    if (showDialog) {
      document.addEventListener("keydown", handleGenerateShortcut)
      return () => {
        document.removeEventListener("keydown", handleGenerateShortcut)
      }
    }
  }, [showDialog, handleGenerateShortcut])

  if (!canUse) {
    return null
  }

  return (
    <>
      <Button
        skin="gradient"
        gradientWeight="thin"
        onClick={() => handleGenerateQueryOpen()}
        disabled={disabled}
        title={`Generate query with AI Assistant (${shortcutTitle})`}
        data-hook="button-generate-sql"
      >
        Generate query
        <KeyBinding $disabled={disabled}>
          <Key
            keyString={ctrlCmd}
            color={disabled ? color("gray1") : color("pinkPrimary")}
            hoverColor={disabled ? color("gray1") : color("pinkPrimary")}
          />
          <Key
            keyString="G"
            color={disabled ? color("gray1") : color("pinkPrimary")}
            hoverColor={disabled ? color("gray1") : color("pinkPrimary")}
          />
        </KeyBinding>
      </Button>

      <Dialog.Root
        open={showDialog}
        onOpenChange={(open) => !open && handleCloseDialog()}
      >
        <Dialog.Portal>
          <ForwardRef>
            <Overlay primitive={Dialog.Overlay} />
          </ForwardRef>

          <Dialog.Content
            onEscapeKeyDown={handleCloseDialog}
            onInteractOutside={handleCloseDialog}
            style={{
              minWidth: "60rem",
            }}
          >
            <StyledDialogTitle>
              <img src="/assets/ai-sparkle.svg" alt="" />
              Generate Query
            </StyledDialogTitle>
            <StyledContent>
              <StyledDialogDescription>
                Describe your query in natural language to generate the
                corresponding QuestDB SQL. Example: &quot;Show bid-ask spread
                for BTC/USD over the last 5 minutes.&quot;
              </StyledDialogDescription>

              <StyledTextArea
                placeholder="Describe your query..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault()
                    void handleGenerate()
                  }
                }}
              />
            </StyledContent>

            <Dialog.ActionButtons>
              <Dialog.Close asChild>
                <StyledDialogButton
                  skin="secondary"
                  onClick={handleCloseDialog}
                >
                  Cancel
                </StyledDialogButton>
              </Dialog.Close>

              <StyledDialogButton
                skin="primary"
                onClick={handleGenerate}
                disabled={!description.trim()}
              >
                Generate
                <KeyBinding $disabled={!description.trim()}>
                  <Key
                    keyString={ctrlCmd}
                    color={
                      !description.trim()
                        ? color("gray1")
                        : color("pinkPrimary")
                    }
                    hoverColor={
                      !description.trim()
                        ? color("gray1")
                        : color("pinkPrimary")
                    }
                  />
                  <Key
                    keyString="Enter"
                    color={
                      !description.trim()
                        ? color("gray1")
                        : color("pinkPrimary")
                    }
                    hoverColor={
                      !description.trim()
                        ? color("gray1")
                        : color("pinkPrimary")
                    }
                  />
                </KeyBinding>
              </StyledDialogButton>
            </Dialog.ActionButtons>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
