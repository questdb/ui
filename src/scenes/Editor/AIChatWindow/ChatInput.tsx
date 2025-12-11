import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react"
import styled, { css } from "styled-components"
import { Box } from "../../../components"
import { color } from "../../../utils"
import { Stop as StopFill, CloseCircle } from "@styled-icons/remix-fill"
import {
  useAIStatus,
  isBlockingAIStatus,
  AIOperationStatus,
} from "../../../providers/AIStatusProvider"
import { slideAnimation, spinAnimation } from "../../../components/Animation"
import { pinkLinearGradientHorizontal } from "../../../theme"
import type { QueryKey } from "../Monaco/utils"

// Send arrow icon
const SendArrowIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    width="18"
    height="18"
  >
    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
  </svg>
)

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
  padding: 0.5rem 1rem;
  flex-shrink: 0;
  width: 100%;
  margin-top: auto;
`

const InputWrapper = styled(Box)`
  display: flex;
  position: relative;
  width: 100%;
`

const StyledTextArea = styled.textarea`
  flex: 1;
  min-height: 4rem;
  max-height: 12rem;
  line-height: 1.3;
  padding: 1rem 4.5rem 1rem 1.2rem;
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
    opacity: 0.6;
  }
`

const ActionButton = styled.button`
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
`

const SendButton = styled(ActionButton)`
  background: ${color("pinkDarker")};
  color: ${color("foreground")};

  &:hover:not(:disabled) {
    background: ${color("pink")};
  }

  &:disabled {
    opacity: 0.4;
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
  queryKey?: QueryKey
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
      queryKey,
    },
    ref,
  ) => {
    const [input, setInput] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus()
      },
    }))
    const { status: aiStatus, abortOperation, activeQueryKey } = useAIStatus()

    const isOperationForThisConversation = Boolean(
      queryKey && activeQueryKey && queryKey === activeQueryKey,
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
            <StyledTextArea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
            />
            <SendButton
              onClick={handleSend}
              disabled={!input.trim() || disabled}
              title="Send (Enter) • New line (Shift+Enter)"
            >
              <SendArrowIcon />
            </SendButton>
          </InputWrapper>
        )}
      </InputContainer>
    )
  },
)
