import React from "react"
import styled from "styled-components"
import { Information } from "@styled-icons/remix-line"
import { DropdownMenu } from "../../../components/DropdownMenu"
import { PlayFilled } from "../../../components/icons/play-filled"
import type { Request } from "./utils"

const StyledDropdownContent = styled(DropdownMenu.Content)`
  background-color: #343846;
  border-radius: 0.5rem;
  padding: 0.4rem;
  box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.36);
  z-index: 9999;
  min-width: 160px;
  gap: 0;
`

const StyledDropdownItem = styled(DropdownMenu.Item)`
  font-size: 1.3rem;
  height: 3rem;
  font-family: "system-ui", sans-serif;
  cursor: pointer;
  color: rgb(248, 248, 242);
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  border-radius: 0.4rem;
  margin: 0;
  gap: 0;
  border: 1px solid transparent;

  &[data-highlighted] {
    background: #043c5c;
    border: 1px solid #8be9fd;
  }

  &[data-disabled] {
    opacity: 0.5;
  }
`

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1.2rem;
`

const StyledPlayFilled = styled(PlayFilled)`
  transform: scale(1.3);
`

const HiddenTrigger = styled.div<{ style?: { top: string; left: string } }>`
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  top: ${props => props.style?.top || '0px'};
  left: ${props => props.style?.left || '0px'};
  z-index: 9998;
`

interface QueryDropdownProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionRef: React.MutableRefObject<{ x: number; y: number } | null>
  queriesRef: React.MutableRefObject<Request[]>
  isContextMenuRef: React.MutableRefObject<boolean>
  onRunQuery: (query?: Request) => void
  onExplainQuery: (query?: Request) => void
}

export const QueryDropdown: React.FC<QueryDropdownProps> = ({
  open,
  onOpenChange,
  positionRef,
  queriesRef,
  isContextMenuRef,
  onRunQuery,
  onExplainQuery,
}) => {
  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen)
  }

  const extractQueryTextToRun = (query: Request) => {
    if (!query) return "query"
    const queryText = query.selection ? query.selection.queryText : query.query
    return queryText.length > 30 
      ? `"${queryText.substring(0, 30)}..."` 
      : `"${queryText}"`
  }

  const isExplainDisabled = (query: Request) => {
    if (!query) return false
    const queryText = query.selection ? query.selection.queryText : query.query
    return queryText.startsWith("EXPLAIN") || queryText.startsWith("explain")
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild>
        <HiddenTrigger 
          style={{ 
            top: positionRef.current?.y ? `${positionRef.current.y}px` : '0px',
            left: positionRef.current?.x ? `${positionRef.current.x}px` : '0px'
          }} 
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <StyledDropdownContent>
          {queriesRef.current.length > 1 ? (
            // Multiple queries - show options for each
            queriesRef.current.map((query, index) => {
              const items = [
                <StyledDropdownItem 
                  key={`run-${index}`}
                  onClick={() => onRunQuery(query)} 
                  data-hook={`dropdown-item-run-query-${index}`}
                >
                  <IconWrapper><StyledPlayFilled size={18} color="#fff" /></IconWrapper>
                  Run {extractQueryTextToRun(query)}
                </StyledDropdownItem>
              ]
              
              if (isContextMenuRef.current) {
                items.push(
                  <StyledDropdownItem 
                    key={`explain-${index}`}
                    disabled={isExplainDisabled(query)}
                    onClick={() => onExplainQuery(query)} 
                    data-hook={`dropdown-item-explain-query-${index}`}
                  >
                    <IconWrapper><Information size={18} /></IconWrapper>
                    Get query plan for {extractQueryTextToRun(query)}
                  </StyledDropdownItem>
                )
              }
              
              return items
            }).flat()
          ) : (
            [
              <StyledDropdownItem key="run" onClick={() => onRunQuery(queriesRef.current[0])} data-hook="dropdown-item-run-query">
                <IconWrapper><StyledPlayFilled size={18} color="#fff" /></IconWrapper>
                Run {extractQueryTextToRun(queriesRef.current[0])}
              </StyledDropdownItem>,
              <StyledDropdownItem key="explain" disabled={isExplainDisabled(queriesRef.current[0])} onClick={() => onExplainQuery(queriesRef.current[0])} data-hook="dropdown-item-get-query-plan">
                <IconWrapper><Information size={18} /></IconWrapper>
                Get query plan for {extractQueryTextToRun(queriesRef.current[0])}
              </StyledDropdownItem>
            ]
          )}
        </StyledDropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
} 