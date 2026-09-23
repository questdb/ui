import React, { useState, useMemo, useRef, useEffect } from "react"
import styled from "styled-components"
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"
import { useSelector } from "react-redux"
import { color } from "../../../utils"
import { useAIConversation } from "../../../providers/AIConversationProvider"
import {
  useAIStatus,
  isBlockingAIStatus,
} from "../../../providers/AIStatusProvider"
import { useEditor } from "../../../providers"
import { selectors } from "../../../store"
import {
  Button,
  AlertDialog,
  Overlay,
  ForwardRef,
  Input,
  IconButton,
} from "../../../components"
import { ChatHistoryItem } from "./ChatHistoryItem"
import { DateSeparator } from "./DateSeparator"
import { useGroupedConversations, filterConversations } from "./historyUtils"
import type { ConversationId } from "../../../providers/AIConversationProvider/types"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 2rem 1rem 4rem 1rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  overflow: hidden;
`

const SearchContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
`

const SearchIcon = styled.div`
  position: absolute;
  left: 1.2rem;
  display: flex;
  align-items: center;
  color: ${color("contentSecondary")};
  pointer-events: none;
  z-index: 1;
`

const ClearButton = styled(IconButton).attrs({
  label: "Clear search",
  variant: "ghost",
  size: "sm",
})`
  position: absolute;
  right: 0.8rem;
  padding: 0.2rem;
`

const SearchInput = styled(Input)`
  width: 100%;
  padding: 0.8rem 3.6rem 0.8rem 3.6rem;
`

const ListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 2rem 0.4rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: ${color("contentSecondary")};
  font-size: 1.3rem;
  text-align: center;
  padding: 2rem;
`

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${color("interactionNeutral")};
`

const DialogTitle = styled.h3`
  margin: 0;
  font-weight: 500;
  color: ${color("contentPrimary")};
`

const DialogDescription = styled.p`
  margin: 2rem;
  font-size: 1.4rem;
  line-height: 1.5;
`

const DialogButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 0 2rem 0 2rem;
`

const CancelButton = styled(Button).attrs({ variant: "secondary" })``

const DeleteButton = styled(Button).attrs({ variant: "danger" })``

type ChatHistoryViewProps = {
  currentConversationId: ConversationId | null
}

export const ChatHistoryView: React.FC<ChatHistoryViewProps> = ({
  currentConversationId,
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] =
    useState<ConversationId | null>(null)
  const currentItemRef = useRef<HTMLDivElement>(null)

  const {
    conversationMetas,
    chatWindowState,
    openChatWindow,
    updateConversationName,
    deleteConversation,
  } = useAIConversation()

  const { status } = useAIStatus()
  const { buffers } = useEditor()
  const tables = useSelector(selectors.query.getTables)

  const conversationList = useMemo(
    () => Array.from(conversationMetas.values()),
    [conversationMetas],
  )

  const filteredConversations = useMemo(
    () => filterConversations(conversationList, searchQuery),
    [conversationList, searchQuery],
  )

  const groupedConversations = useGroupedConversations(filteredConversations)

  const getSubtitle = (id: number, type: "buffer" | "table") => {
    if (!id) {
      return undefined
    }
    if (type === "buffer") {
      const buffer = buffers.find((b) => b.id === id)
      if (buffer) {
        return buffer.label
      }
    } else if (type === "table") {
      const table = tables.find((t) => t.id === id)
      if (table) {
        return table.table_name
      }
    }
    return undefined
  }

  const handleSelect = async (id: ConversationId) => {
    await openChatWindow(id)
  }

  const handleRename = async (id: ConversationId, newName: string) => {
    await updateConversationName(id, newName)
  }

  const handleDeleteClick = (id: ConversationId) => {
    setConversationToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (conversationToDelete) {
      await deleteConversation(conversationToDelete)
    }
    setDeleteDialogOpen(false)
    setConversationToDelete(null)
  }

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setConversationToDelete(null)
  }

  useEffect(() => {
    if (currentItemRef.current) {
      currentItemRef.current.scrollIntoView({
        block: "center",
      })
    }
  }, [])

  if (conversationList.length === 0) {
    return (
      <Container>
        <EmptyState data-hook="chat-history-empty">
          No conversations yet
        </EmptyState>
      </Container>
    )
  }

  return (
    <Container>
      <SearchContainer>
        <SearchIcon>
          <MagnifyingGlassIcon size={18} />
        </SearchIcon>
        <SearchInput
          type="text"
          placeholder="Search chats"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-hook="chat-history-search"
        />
        {searchQuery && (
          <ClearButton
            onClick={() => setSearchQuery("")}
            title="Clear search"
            data-hook="chat-history-search-clear"
          >
            <XIcon size={16} />
          </ClearButton>
        )}
      </SearchContainer>

      <ListContainer data-hook="chat-history-list">
        {groupedConversations.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            {groupIndex > 0 && <DateSeparator label={group.label} />}
            {group.conversations.map((conv) => {
              const isCurrent = conv.id === currentConversationId
              return (
                <div key={conv.id} ref={isCurrent ? currentItemRef : undefined}>
                  <ChatHistoryItem
                    conversation={conv}
                    subtitle={
                      (conv.bufferId ?? conv.tableId)
                        ? getSubtitle(
                            conv.bufferId ?? conv.tableId!,
                            conv.bufferId ? "buffer" : "table",
                          )
                        : undefined
                    }
                    isCurrent={isCurrent}
                    hasOngoingProcess={
                      conv.id === chatWindowState.activeConversationId &&
                      isBlockingAIStatus(status)
                    }
                    disabled={
                      isBlockingAIStatus(status) &&
                      conv.id !== chatWindowState.activeConversationId
                    }
                    onSelect={handleSelect}
                    onRename={handleRename}
                    onDelete={handleDeleteClick}
                  />
                </div>
              )
            })}
          </React.Fragment>
        ))}
        {filteredConversations.length === 0 && searchQuery && (
          <EmptyState>No chats match your search</EmptyState>
        )}
      </ListContainer>

      <AlertDialog.Root
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialog.Portal>
          <ForwardRef>
            <Overlay primitive={AlertDialog.Overlay} />
          </ForwardRef>
          <AlertDialog.Content maxwidth="40rem">
            <DialogHeader>
              <DialogTitle>Delete conversation</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action
              cannot be undone.
            </DialogDescription>
            <DialogButtons>
              <AlertDialog.Cancel asChild>
                <CancelButton onClick={handleCancelDelete}>Cancel</CancelButton>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <DeleteButton onClick={handleConfirmDelete}>
                  Delete
                </DeleteButton>
              </AlertDialog.Action>
            </DialogButtons>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Container>
  )
}
