import React, { useState, useRef, useEffect } from "react"
import styled from "styled-components"
import {
  ChatTextIcon,
  PencilSimpleLineIcon,
  TrashSimpleIcon,
} from "@phosphor-icons/react"
import { color } from "../../../utils"
import type { AIConversation } from "../../../providers/AIConversationProvider/types"

const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  background: ${color("transparent")};

  &:hover {
    background: ${color("selection")};

    .chat-title {
      color: ${color("foreground")};
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
  overflow: visible;
`

const Title = styled.div.attrs({ className: "chat-title" })`
  padding: 0.2rem 0.4rem;
  line-height: 1.5rem;
  border: 1px solid transparent;
  color: ${color("offWhite")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transform: translateX(-0.4rem);
`

const TitleInput = styled.input`
  line-height: 1.5rem;
  color: ${color("foreground")};
  background: transparent;
  border: 1px solid ${color("pinkDarker")};
  border-radius: 4px;
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
  conversation: AIConversation
  subtitle?: string
  isCurrent: boolean
  onSelect: (id: string) => void
  onRename: (id: string, newName: string) => void
  onDelete: (id: string) => void
}

export const ChatHistoryItem: React.FC<ChatHistoryItemProps> = ({
  conversation,
  subtitle,
  isCurrent,
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
    if (!isEditing) {
      onSelect(conversation.id)
    }
  }

  return (
    <Container onClick={handleContainerClick}>
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
          />
        ) : (
          <Title>{conversation.conversationName}</Title>
        )}
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </Content>
      <ActionsContainer>
        {!isEditing && (
          <>
            <ActionButton onClick={handleEditClick} title="Edit title">
              <PencilSimpleLineIcon size={18} />
            </ActionButton>
            <ActionButton onClick={handleDeleteClick} title="Delete">
              <TrashSimpleIcon size={18} />
            </ActionButton>
          </>
        )}
        {isCurrent && <CurrentIndicator>Current</CurrentIndicator>}
      </ActionsContainer>
    </Container>
  )
}
