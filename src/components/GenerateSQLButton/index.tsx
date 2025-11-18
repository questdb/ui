import React, {
  useCallback,
  useState,
  useContext,
  useEffect,
  useRef,
} from "react"
import styled, { css } from "styled-components"
import { Button, Box, Dialog, ForwardRef, Overlay, Key } from "../../components"
import { color, platform } from "../../utils"
import { useSelector } from "react-redux"
import { useEditor } from "../../providers/EditorProvider"
import type { AiAssistantAPIError, GeneratedSQL } from "../../utils/aiAssistant"
import {
  generateSQL,
  formatExplanationAsComment,
  createSchemaClient,
  isAiAssistantError,
  type ActiveProviderSettings,
} from "../../utils/aiAssistant"
import { providerForModel } from "../../utils/aiAssistantSettings"
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
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  resize: vertical;
  outline: none;
  margin-bottom: 2rem;

  &:focus {
    border-color: ${({ theme }) => theme.color.pink};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }
`

type Props = {
  onBufferContentChange?: (value?: string) => void
}

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"
const shortcutTitle =
  platform.isMacintosh || platform.isIOS ? "Cmd+G" : "Ctrl+G"

export const GenerateSQLButton = ({ onBufferContentChange }: Props) => {
  const { quest } = useContext(QuestContext)
  const { editorRef } = useEditor()
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
  const [showDialog, setShowDialog] = useState(false)
  const [description, setDescription] = useState("")
  const highlightDecorationsRef = useRef<string[]>([])
  const disabled =
    running !== RunningType.NONE ||
    !editorRef.current ||
    isBlockingAIStatus(aiStatus)

  const handleGenerate = async () => {
    setShowDialog(false)
    setDescription("")

    if (!canUse) {
      toast.error("No model selected for AI Assistant")
      return
    }

    const schemaClient = hasSchemaAccessValue
      ? createSchemaClient(tables, quest)
      : undefined
    const provider = providerForModel(currentModel)

    const settings: ActiveProviderSettings = {
      model: currentModel,
      provider,
      apiKey,
    }

    const response = await generateSQL({
      description,
      settings,
      schemaClient,
      setStatus,
      abortSignal: abortController?.signal,
    })

    if (isAiAssistantError(response)) {
      const error = response as AiAssistantAPIError
      if (error.type !== "aborted") {
        toast.error(error.message, { autoClose: 10000 })
      }
      return
    }

    const result = response as GeneratedSQL
    if (!result.sql) {
      toast.error("No query received from AI Assistant", { autoClose: 10000 })
      return
    }

    if (editorRef.current) {
      const model = editorRef.current.getModel()
      if (!model) return

      const commentBlock = formatExplanationAsComment(
        `${description}\nExplanation:\n${result.explanation}`,
        `Prompt`,
      )
      const sqlWithComment = `\n${commentBlock}\n${result.sql}\n`

      const lineNumber = model.getLineCount()
      const column = model.getLineMaxColumn(lineNumber)

      editorRef.current.executeEdits("generate-sql", [
        {
          range: {
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column,
          },
          text: sqlWithComment,
        },
      ])

      if (onBufferContentChange) {
        onBufferContentChange(editorRef.current.getValue())
      }

      editorRef.current.revealLineNearTop(lineNumber)
      highlightDecorationsRef.current =
        editorRef.current
          .getModel()
          ?.deltaDecorations(highlightDecorationsRef.current, [
            {
              range: {
                startLineNumber: lineNumber,
                startColumn: column,
                endLineNumber:
                  lineNumber + sqlWithComment.split("\n").length - 1,
                endColumn: column,
              },
              options: {
                className: "aiQueryHighlight",
                isWholeLine: false,
              },
            },
          ]) ?? []
      setTimeout(() => {
        highlightDecorationsRef.current =
          editorRef.current
            ?.getModel()
            ?.deltaDecorations(highlightDecorationsRef.current, []) ?? []
      }, 1000)
      editorRef.current.setPosition({ lineNumber: lineNumber + 1, column: 1 })
      editorRef.current.focus()
    }

    toast.success("Query generated!")
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
              Generate query
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
                skin="gradient"
                onClick={handleGenerate}
                disabled={!description.trim()}
              >
                Generate
              </StyledDialogButton>
            </Dialog.ActionButtons>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
