import React, { useState, useRef, useEffect } from "react"
import styled from "styled-components"
import {
  ChatTextIcon,
  PencilSimpleLineIcon,
  TrashSimpleIcon,
} from "@phosphor-icons/react"
import { color } from "../../../utils"
import type { ConversationMeta } from "../../../store/db"

const Container = styled.div<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  background: ${color("transparent")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};

  &:hover {
    background: ${({ $disabled }) =>
      $disabled ? "transparent" : color("selection")};

    .chat-title {
      color: ${({ $disabled }) =>
        $disabled ? color("offWhite") : color("foreground")};
    }
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

  ${Container}:hover & {
    opacity: 1;
  }

  &:hover {
    background: ${color("backgroundDarker")};
  }
`

const CurrentIndicator = styled.span`
  font-size: 1.2rem;
  line-height: 1.5rem;
  color: #9ca3af;
  white-space: nowrap;
`

type ChatHistoryItemProps = {
  conversation: ConversationMeta
  subtitle?: string
  isCurrent: boolean
  hasOngoingProcess?: boolean
  disabled?: boolean
  onSelect: (id: string) => void
  onRename: (id: string, newName: string) => void
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

  const handleSave = () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== conversation.conversationName) {
      onRename(conversation.id, trimmedValue)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      setEditValue(conversation.conversationName)
      setIsEditing(false)
    }
  }

  const handleBlur = () => {
    handleSave()
  }

  const handleContainerClick = () => {
    if (!isEditing && !disabled) {
      onSelect(conversation.id)
    }
  }

  return (
    <Container
      onClick={handleContainerClick}
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
