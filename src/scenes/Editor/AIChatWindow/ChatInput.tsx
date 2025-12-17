import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react"
import styled, { css } from "styled-components"
import { Box } from "../../../components"
import { Text } from "../../../components/Text"
import { color } from "../../../utils"
import { ArrowUpIcon, CodeBlockIcon } from "@phosphor-icons/react"
import { Stop as StopFill, CloseCircle } from "@styled-icons/remix-fill"
import {
  useAIStatus,
  isBlockingAIStatus,
  AIOperationStatus,
} from "../../../providers/AIStatusProvider"
import { slideAnimation, spinAnimation } from "../../../components/Animation"
import { pinkLinearGradientHorizontal } from "../../../theme"
import type {
  SchemaDisplayData,
  ConversationId,
} from "../../../providers/AIConversationProvider/types"
import { TableIcon } from "../../Schema/table-icon"

// Gradient spinner icon (same as AIStatusIndicator)
const CircleNotch = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path
      d="M15.75 3.75C17.32 4.48224 18.6482 5.64772 19.5783 7.10926C20.5084 8.57081 21.0016 10.2676 21 12C21 14.3869 20.0518 16.6761 18.364 18.364C16.6761 20.0518 14.387 21 12 21C9.61306 21 7.32387 20.0518 5.63604 18.364C3.94822 16.6761 3 14.3869 3 12C2.99838 10.2676 3.49163 8.57081 4.4217 7.10926C5.35178 5.64772 6.67998 4.48224 8.25 3.75"
      stroke="url(#paint0_linear_chat_spinner)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient
        id="paint0_linear_chat_spinner"
        x1="12"
        y1="3.75"
        x2="12"
        y2="21"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#D14671" />
        <stop offset="1" stopColor="#892C6C" />
      </linearGradient>
    </defs>
  </svg>
)

const InputContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
  padding: 1rem 1.2rem;
  flex-shrink: 0;
  width: 100%;
  margin-top: auto;
  border-top: 1px solid ${color("selection")};
`

const InputWrapper = styled(Box)`
  display: flex;
  position: relative;
  width: 100%;
  overflow: hidden;
`

const StyledTextArea = styled.textarea<{ $hasContext: boolean }>`
  flex: 1;
  min-height: 8rem;
  max-height: 30rem;
  line-height: 1.3;
  padding: ${({ $hasContext }) =>
    $hasContext
      ? "4.4rem 4.5rem 1.2rem 1.2rem"
      : "1.2rem 4.5rem 1.2rem 1.2rem"};
  background: ${color("backgroundDarker")};
  border: 1px solid ${color("selection")};
  border-radius: 0.6rem;
  color: ${color("foreground")};
  font-size: 1.4rem;
  font-family: ${({ theme }) => theme.font};
  resize: none;
  outline: none;

  &:focus {
    border-color: ${color("pinkDarker")};
  }

  &::placeholder {
    color: ${color("gray2")};
  }

  &:disabled {
    opacity: 0.5;
  }
`

const ActionButton = styled.button`
  position: absolute;
  right: 0.8rem;
  bottom: 0.8rem;
  padding: 0.6rem;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.4rem;
  cursor: pointer;
`

const ContextBadgeContainer = styled.div`
  position: absolute;
  padding: 0.8rem;
  top: 1px;
  border-radius: 0.6rem;
  left: 1px;
  width: calc(100% - 0.2rem);
  display: inline-flex;
  background: ${color("backgroundDarker")};
`

const ContextBadge = styled.div<{ $type: "sql" | "table" }>`
  display: flex;
  padding: 0.3rem 0.6rem;
  align-items: center;
  gap: 0.4rem;
  line-height: 1.4;
  border-radius: 0.6rem;
  border: 1px solid ${color("selection")};
  background: ${color("chatBackground")};
  color: ${color("gray2")};
  font-size: 1.3rem;
  user-select: none;

  ${({ $type }) =>
    $type === "sql" &&
    css`
      cursor: pointer;

      &:hover {
        border: 1px solid ${color("offWhite")};
        color: ${color("offWhite")};
      }
    `}
`

const ContextBadgeIcon = styled.div`
  display: flex;
  align-items: center;
  color: ${color("gray2")};
  flex-shrink: 0;

  svg {
    color: ${color("gray2")};
  }
`

const SendButton = styled(ActionButton)`
  background: ${color("pinkDarker")};
  color: ${color("foreground")};

  &:hover:not(:disabled) {
    background: ${color("pink")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const ThoughtStream = styled.div<{ $aborted?: boolean }>`
  display: flex;
  position: relative;
  width: 100%;
  background: ${color("backgroundDarker")};
  border: 1px solid transparent;
  background:
    linear-gradient(${color("backgroundDarker")}, ${color("backgroundDarker")})
      padding-box,
    ${pinkLinearGradientHorizontal} border-box;
  border-radius: 0.6rem;
  height: 4rem;

  ${({ $aborted }) =>
    $aborted &&
    css`
      background: ${color("backgroundDarker")};
      border: 1px solid ${color("red")};
    `}
`

const ThoughtStreamContent = styled.div<{ $aborted?: boolean }>`
  display: flex;
  align-items: center;
  background: ${color("backgroundDarker")};
  gap: 0.8rem;
  width: 100%;
  height: 100%;
  border-radius: 0.6rem;
  padding: 0 1.2rem;
  padding-right: ${({ $aborted }) => ($aborted ? "1.2rem" : "4.5rem")};
`

const SpinnerIcon = styled(CircleNotch)`
  width: 2rem;
  height: 2rem;
  ${spinAnimation};
  flex-shrink: 0;
  transform-origin: center;
`

const CloseCircleIcon = styled(CloseCircle)`
  width: 2rem;
  height: 2rem;
  color: ${color("red")};
  flex-shrink: 0;
`

const ThoughtText = styled.div<{ $aborted?: boolean }>`
  font-weight: 500;
  font-size: 1.4rem;
  color: ${color("gray2")};
  ${({ $aborted }) => !$aborted && slideAnimation}
`

const StopButton = styled.button`
  position: absolute;
  right: 0.8rem;
  top: 50%;
  transform: translateY(-50%);
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #da152832;
  color: #da1e28;

  &:hover {
    background: ${color("red")};
    color: ${color("foreground")};
  }
`

type ChatInputProps = {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  conversationId?: ConversationId
  contextSQL?: string
  contextSchemaData?: SchemaDisplayData
  onContextClick: () => void
}

const truncateText = (text: string, maxLength: number = 30): string => {
  if (!text) return ""
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength) + "..."
}

export type ChatInputHandle = {
  focus: () => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      onSend,
      disabled = false,
      placeholder = "Ask a question or request a refinement...",
      conversationId,
      contextSQL,
      contextSchemaData,
      onContextClick,
    },
    ref,
  ) => {
    const [input, setInput] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Determine what to show in context badge
    const contextText = contextSchemaData?.tableName
      ? truncateText(contextSchemaData.tableName)
      : contextSQL
        ? truncateText(contextSQL)
        : null
    const hasContext = Boolean(contextText)

    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus()
      },
    }))
    const {
      status: aiStatus,
      abortOperation,
      activeConversationId,
    } = useAIStatus()

    const isOperationForThisConversation = Boolean(
      conversationId &&
        activeConversationId &&
        conversationId === activeConversationId,
    )
    const isAIInProgress =
      isBlockingAIStatus(aiStatus) && isOperationForThisConversation
    const isAborted =
      aiStatus === AIOperationStatus.Aborted && isOperationForThisConversation

    useEffect(() => {
      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }, [input])

    const handleSend = () => {
      const trimmed = input.trim()
      if (trimmed && !disabled && !isAIInProgress) {
        onSend(trimmed)
        setInput("")
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto"
        }
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        // Enter without Shift -> send message
        e.preventDefault()
        handleSend()
      }
      // Shift+Enter -> allow default behavior (new line)
    }

    const handleContextClickInternal = () => {
      if (!contextSchemaData) {
        onContextClick()
      }
    }

    const handleStop = () => {
      abortOperation()
    }

    const showThoughtStream = isAIInProgress || isAborted

    return (
      <InputContainer>
        {showThoughtStream ? (
          <ThoughtStream $aborted={isAborted}>
            <ThoughtStreamContent $aborted={isAborted}>
              {isAborted ? <CloseCircleIcon /> : <SpinnerIcon />}
              <ThoughtText $aborted={isAborted}>{aiStatus}</ThoughtText>
            </ThoughtStreamContent>
            {!isAborted && (
              <StopButton onClick={handleStop} title="Stop generation">
                <StopFill size="14px" />
              </StopButton>
            )}
          </ThoughtStream>
        ) : (
          <InputWrapper>
            {hasContext && (
              <ContextBadgeContainer>
                <ContextBadge
                  role="presentation"
                  onClick={handleContextClickInternal}
                  $type={contextSchemaData ? "table" : "sql"}
                >
                  <ContextBadgeIcon>
                    {contextSchemaData ? (
                      <TableIcon
                        isMaterializedView={contextSchemaData.isMatView}
                        partitionBy={contextSchemaData.partitionBy}
                        walEnabled={contextSchemaData.walEnabled}
                        designatedTimestamp={
                          contextSchemaData.designatedTimestamp
                        }
                      />
                    ) : (
                      <CodeBlockIcon size={14} weight="regular" />
                    )}
                  </ContextBadgeIcon>
                  {contextText}
                </ContextBadge>
              </ContextBadgeContainer>
            )}
            <StyledTextArea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              $hasContext={hasContext}
            />
            <SendButton
              onClick={handleSend}
              disabled={!input.trim() || disabled}
              title="Send (Enter) • New line (Shift+Enter)"
            >
              <ArrowUpIcon size={20} weight="bold" />
            </SendButton>
          </InputWrapper>
        )}
        <Text color="gray2" size="sm" align="center">
          Chats are connected to a single query to improve responses.
        </Text>
      </InputContainer>
    )
  },
)
