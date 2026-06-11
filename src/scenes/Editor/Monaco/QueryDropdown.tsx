import React from "react"
import styled from "styled-components"
import { Information } from "@styled-icons/remix-line"
import { LinkSimpleIcon } from "@phosphor-icons/react"
import { DropdownMenu } from "../../../components/DropdownMenu"
import { PlayFilled } from "../../../components/icons/play-filled"
import { AISparkle } from "../../../components/AISparkle"
import type { Request } from "./utils"

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
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
  top: ${(props) => props.style?.top || "0px"};
  left: ${(props) => props.style?.left || "0px"};
  z-index: 9998;
`

type QueryDropdownProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionRef: React.MutableRefObject<{ x: number; y: number } | null>
  queriesRef: React.MutableRefObject<Request[]>
  isContextMenuRef: React.MutableRefObject<boolean>
  isAIDropdownRef: React.MutableRefObject<boolean>
  onRunQuery: (query: Request) => void
  onExplainQuery: (query: Request) => void
  onCopyQueryLink: (query: Request) => void
  onAskAIRef: React.MutableRefObject<(query?: Request) => void>
}

export const QueryDropdown: React.FC<QueryDropdownProps> = ({
  open,
  onOpenChange,
  positionRef,
  queriesRef,
  isContextMenuRef,
  isAIDropdownRef,
  onRunQuery,
  onExplainQuery,
  onCopyQueryLink,
  onAskAIRef,
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
            top: positionRef.current?.y ? `${positionRef.current.y}px` : "0px",
            left: positionRef.current?.x ? `${positionRef.current.x}px` : "0px",
          }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content>
          {isAIDropdownRef.current
            ? // AI dropdown - show "Ask AI about query X" options
              queriesRef.current.map((query, index) => (
                <DropdownMenu.Item
                  // eslint-disable-next-line react/no-array-index-key
                  key={`ask-ai-${query.query}-${index}`}
                  onClick={() => onAskAIRef.current(query)}
                  data-hook={`dropdown-item-ask-ai-${index}`}
                >
                  <IconWrapper>
                    <AISparkle size={18} variant="filled" />
                  </IconWrapper>
                  Ask AI about {extractQueryTextToRun(query)}
                </DropdownMenu.Item>
              ))
            : queriesRef.current.length > 1
              ? // Multiple queries - show options for each
                queriesRef.current
                  .map((query, index) => {
                    const items = [
                      <DropdownMenu.Item
                        // eslint-disable-next-line react/no-array-index-key
                        key={`run-${query.query}-${index}`}
                        onClick={() => onRunQuery(query)}
                        data-hook={`dropdown-item-run-query-${index}`}
                      >
                        <IconWrapper>
                          <StyledPlayFilled size={18} color="#fff" />
                        </IconWrapper>
                        Run {extractQueryTextToRun(query)}
                      </DropdownMenu.Item>,
                    ]

                    if (isContextMenuRef.current) {
                      items.push(
                        <DropdownMenu.Item
                          // eslint-disable-next-line react/no-array-index-key
                          key={`explain-${query.query}-${index}`}
                          disabled={isExplainDisabled(query)}
                          onClick={() => onExplainQuery(query)}
                          data-hook={`dropdown-item-explain-query-${index}`}
                        >
                          <IconWrapper>
                            <Information size={18} />
                          </IconWrapper>
                          Get query plan for {extractQueryTextToRun(query)}
                        </DropdownMenu.Item>,
                        <DropdownMenu.Item
                          // eslint-disable-next-line react/no-array-index-key
                          key={`copy-link-${query.query}-${index}`}
                          onClick={() => onCopyQueryLink(query)}
                          data-hook={`dropdown-item-copy-query-link-${index}`}
                        >
                          <IconWrapper>
                            <LinkSimpleIcon size={18} />
                          </IconWrapper>
                          Copy link to {extractQueryTextToRun(query)}
                        </DropdownMenu.Item>,
                      )
                    }

                    return items
                  })
                  .flat()
              : [
                  <DropdownMenu.Item
                    key="run"
                    onClick={() => onRunQuery(queriesRef.current[0])}
                    data-hook="dropdown-item-run-query"
                  >
                    <IconWrapper>
                      <StyledPlayFilled size={18} color="#fff" />
                    </IconWrapper>
                    Run {extractQueryTextToRun(queriesRef.current[0])}
                  </DropdownMenu.Item>,
                  <DropdownMenu.Item
                    key="explain"
                    disabled={isExplainDisabled(queriesRef.current[0])}
                    onClick={() => onExplainQuery(queriesRef.current[0])}
                    data-hook="dropdown-item-get-query-plan"
                  >
                    <IconWrapper>
                      <Information size={18} />
                    </IconWrapper>
                    Get query plan for{" "}
                    {extractQueryTextToRun(queriesRef.current[0])}
                  </DropdownMenu.Item>,
                  <DropdownMenu.Item
                    key="copy-link"
                    onClick={() => onCopyQueryLink(queriesRef.current[0])}
                    data-hook="dropdown-item-copy-query-link"
                  >
                    <IconWrapper>
                      <LinkSimpleIcon size={18} />
                    </IconWrapper>
                    Copy link to {extractQueryTextToRun(queriesRef.current[0])}
                  </DropdownMenu.Item>,
                ]}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
