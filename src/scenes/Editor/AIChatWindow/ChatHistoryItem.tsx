import React, { useState, useRef, useEffect } from "react"
import styled from "styled-components"
import {
  ChatTextIcon,
  PencilSimpleLineIcon,
  TrashSimpleIcon,
} from "@phosphor-icons/react"
import { color } from "../../../utils"
import type { ConversationMeta } from "../../../store/db"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

const Container = styled.div<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  background: ${color("transparent")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  border: 0;
  width: 100%;
  text-align: left;

  &:hover,
  &:focus-visible {
    background: ${({ $disabled }) =>
      $disabled ? "transparent" : color("selection")};

    .chat-title {
      color: ${({ $disabled }) =>
        $disabled ? color("offWhite") : color("foreground")};
    }
  }

  &:focus-visible {
    outline: 2px solid ${color("pink")};
    outline-offset: -2px;
  }
`

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${color("gray2")};
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding-left: 0.4rem;
`

const Title = styled.div.attrs({ className: "chat-title" })`
  padding: 0.2rem 0.4rem;
  border: 1px solid transparent;
  color: ${color("offWhite")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transform: translateX(-0.4rem);
`

const TitleInput = styled.input`
  color: ${color("foreground")};
  background: transparent;
  border: 1px solid ${color("pinkDarker")};
  border-radius: 6px;
  outline: none;
  padding: 0.2rem 0.4rem;
  font-family: inherit;
  transform: translateX(-0.4rem);

  &:focus {
    outline: none;
  }

  &::selection {
    background: ${color("pinkPrimary")};
  }
  &::-moz-selection {
    background: ${color("pinkPrimary")};
  }
  &::-webkit-selection {
    background: ${color("pinkPrimary")};
  }
`

const Subtitle = styled.div`
  font-size: 1.2rem;
  line-height: 1.5;
  color: ${color("gray2")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const ActionsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
`

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: ${color("foreground")};
  opacity: 0;

  ${Container}:hover &,
  ${Container}:focus-within & {
    opacity: 1;
  }

  &:focus-visible {
    opacity: 1;
    outline: 2px solid ${color("pink")};
    outline-offset: -2px;
  }

  &:hover {
    background: ${color("backgroundDarker")};
  }
`

const CurrentIndicator = styled.span`
  font-size: 1.2rem;
  line-height: 1.5rem;
  color: ${color("mutedLabel")};
  white-space: nowrap;
`

type ChatHistoryItemProps = {
  conversation: ConversationMeta
  subtitle?: string
  isCurrent: boolean
  hasOngoingProcess?: boolean
  disabled?: boolean
  onSelect: (id: string) => Promise<void>
  onRename: (id: string, newName: string) => Promise<void>
  onDelete: (id: string) => void
}

export const ChatHistoryItem: React.FC<ChatHistoryItemProps> = ({
  conversation,
  subtitle,
  isCurrent,
  hasOngoingProcess,
  disabled,
  onSelect,
  onRename,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(conversation.conversationName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(conversation.conversationName)
    setIsEditing(true)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(conversation.id)
  }

  const handleSave = async () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== conversation.conversationName) {
      void trackEvent(ConsoleEvent.AI_CHAT_RENAME)
      await onRename(conversation.id, trimmedValue)
    }
    setIsEditing(false)
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      await handleSave()
    } else if (e.key === "Escape") {
      setEditValue(conversation.conversationName)
      setIsEditing(false)
    }
  }

  const handleBlur = async () => {
    await handleSave()
  }

  const handleContainerClick = async () => {
    if (!isEditing && !disabled) {
      await onSelect(conversation.id)
    }
  }

  const handleContainerKeyDown = async (e: React.KeyboardEvent) => {
    if (isEditing || disabled) return
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      await onSelect(conversation.id)
    }
  }

  return (
    <Container
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={handleContainerClick}
      onKeyDown={handleContainerKeyDown}
      $disabled={disabled}
      data-hook="chat-history-item"
    >
      <IconWrapper>
        <ChatTextIcon size={18} />
      </IconWrapper>
      <Content>
        {isEditing ? (
          <TitleInput
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onClick={(e) => e.stopPropagation()}
            data-hook="chat-history-rename"
          />
        ) : (
          <Title data-hook="chat-history-title">
            {conversation.conversationName}
          </Title>
        )}
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </Content>
      <ActionsContainer>
        {!isEditing && (
          <>
            <ActionButton
              onClick={handleEditClick}
              title="Edit title"
              data-hook="chat-history-edit"
            >
              <PencilSimpleLineIcon size={18} />
            </ActionButton>
            {!hasOngoingProcess && (
              <ActionButton
                onClick={handleDeleteClick}
                title="Delete"
                data-hook="chat-history-delete"
              >
                <TrashSimpleIcon size={18} />
              </ActionButton>
            )}
          </>
        )}
        {isCurrent && <CurrentIndicator>Current</CurrentIndicator>}
      </ActionsContainer>
    </Container>
  )
}
