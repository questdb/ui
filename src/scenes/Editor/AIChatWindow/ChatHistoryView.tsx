import React, { useState, useMemo, useRef, useEffect } from "react"
import styled from "styled-components"
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"
import { useSelector } from "react-redux"
import { color } from "../../../utils"
import { useAIConversation } from "../../../providers/AIConversationProvider"
import { useAIStatus } from "../../../providers/AIStatusProvider"
import { useEditor } from "../../../providers"
import { selectors } from "../../../store"
import {
  Button,
  AlertDialog,
  Overlay,
  ForwardRef,
  Input,
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
  background: ${color("chatBackground")};
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
  color: ${color("gray2")};
  pointer-events: none;
  z-index: 1;
`

const ClearButton = styled.button`
  position: absolute;
  right: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: ${color("gray2")};

  &:hover {
    color: ${color("foreground")};
  }
`

const SearchInput = styled(Input)`
  width: 100%;
  background: transparent;
  color: ${color("foreground")};
  padding: 0.8rem 3.6rem 0.8rem 3.6rem;
  border: 1px solid ${color("gray2")}4d;
  height: 3rem;
  border-radius: 0.6rem;

  &:focus {
    background: transparent;
    border-color: ${color("pinkDarker")};
  }
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
  color: ${color("gray2")};
  font-size: 1.3rem;
  text-align: center;
  padding: 2rem;
`

const AlertDialogContent = styled(AlertDialog.Content)`
  background: ${color("chatBackground")};
`

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${color("selection")};
`

const DialogTitle = styled.h3`
  margin: 0;
  font-weight: 500;
  color: ${color("foreground")};
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

const CancelButton = styled(Button).attrs({ skin: "secondary" })``

const DeleteButton = styled(Button)`
  background: ${color("red")};
  border-color: ${color("red")};

  &:hover:not(:disabled) {
    background: ${color("red")};
    filter: brightness(1.1);
  }
`

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
    conversations,
    openChatWindow,
    updateConversationName,
    deleteConversation,
    closeHistoryView,
  } = useAIConversation()

  const { activeConversationId: aiProcessingConversationId } = useAIStatus()
  const { buffers } = useEditor()
  const tables = useSelector(selectors.query.getTables)

  const conversationList = useMemo(
    () => Array.from(conversations.values()),
    [conversations],
  )

  const filteredConversations = useMemo(
    () => filterConversations(conversationList, searchQuery),
    [conversationList, searchQuery],
  )

  const groupedConversations = useGroupedConversations(filteredConversations)

  const getSubtitle = (bufferId: number | string | null, tableId?: number) => {
    if (bufferId != null) {
      const buffer = buffers.find((b) => b.id === bufferId)
      if (buffer) {
        return buffer.label
      }
    }
    if (tableId != null) {
      const table = tables.find((t) => t.id === tableId)
      if (table) {
        return table.table_name
      }
    }
    return undefined
  }

  const handleSelect = (id: ConversationId) => {
    openChatWindow(id)
    closeHistoryView()
  }

  const handleRename = (id: ConversationId, newName: string) => {
    updateConversationName(id, newName)
  }

  const handleDeleteClick = (id: ConversationId) => {
    setConversationToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      deleteConversation(conversationToDelete)
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
        <EmptyState>No conversations yet</EmptyState>
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
          onKeyDown={(e) => {
            if (e.key === "Escape" && searchQuery) {
              setSearchQuery("")
            }
          }}
        />
        {searchQuery && (
          <ClearButton onClick={() => setSearchQuery("")} title="Clear search">
            <XIcon size={16} />
          </ClearButton>
        )}
      </SearchContainer>

      <ListContainer>
        {groupedConversations.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            {groupIndex > 0 && <DateSeparator label={group.label} />}
            {group.conversations.map((conv) => {
              const isCurrent = conv.id === currentConversationId
              return (
                <div key={conv.id} ref={isCurrent ? currentItemRef : undefined}>
                  <ChatHistoryItem
                    conversation={conv}
                    subtitle={getSubtitle(conv.bufferId, conv.tableId)}
                    isCurrent={isCurrent}
                    hasOngoingProcess={conv.id === aiProcessingConversationId}
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
          <AlertDialogContent maxwidth="40rem">
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
          </AlertDialogContent>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Container>
  )
}
