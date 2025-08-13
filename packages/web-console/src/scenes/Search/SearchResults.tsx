import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import styled from 'styled-components'
import type { SearchMatch } from '../../services/search'
import { useEditor } from '../../providers'
import { InsertChart } from '@styled-icons/material'
import { ChevronRight, ChevronDown } from '@styled-icons/boxicons-solid'
import { FileText } from '@styled-icons/remix-line'
import { Text } from '../../components'
import { VirtualizedTree, VirtualizedTreeHandle } from '../../components/VirtualizedTree'

const ResultsContainer = styled.div`
  padding: 0;
  width: 100%;
  height: 100%;
`

const ItemWrapper = styled.div<{ $focused?: boolean; $isHeader?: boolean; $level?: number }>`
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.5rem 0;
  padding-left: ${props => (props.$level || 0) * 1.5 + 1}rem;
  padding-right: 1rem;
  user-select: none;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  width: 100%;
  min-height: 3.2rem;
  
  ${({ $focused, theme }) => $focused && `
    outline: none;
    background: ${theme.color.tableSelection};
    border: 1px solid ${theme.color.cyan};
  `}
`

const ChevronIcon = styled.div`
  position: absolute;
  left: 0.5rem;
  color: ${({ theme }) => theme.color.gray2};
  display: flex;
  align-items: center;
  cursor: pointer;
  
  svg {
    width: 1.5rem;
    height: 1.5rem;
  }
`

const FileIcon = styled.div`
  margin-right: 0.8rem;
  display: flex;
  align-items: center;
  
  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
`

const ItemText = styled(Text)<{ $isArchived?: boolean }>`
  flex: 1;
  font-weight: 500;
  color: ${({ theme, $isArchived }) => $isArchived ? theme.color.gray2 : theme.color.foreground};
  font-style: ${props => props.$isArchived ? 'italic' : 'normal'};
  display: flex;
  align-items: center;
  gap: 0.8rem;
  
  .highlight {
    background-color: #45475a;
    color: ${({ theme }) => theme.color.foreground};
  }
  
  mark {
    background-color: rgb(163,127,96);
    border-radius: 0.2rem;
    color: ${({ theme }) => theme.color.foreground};
    padding: 0.2rem;
  }
`

const BufferStatus = styled.span`
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1rem;
  margin-left: 0.4rem;
  padding: 0.2rem 0.4rem;
  background: ${({ theme }) => theme.color.selection};
  border-radius: 0.2rem;
`

const MatchCount = styled.span`
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.1rem;
  margin-left: 0.8rem;
`

const LineNumber = styled.span`
  color: ${({ theme }) => theme.color.comment};
  margin-right: 0.5rem;
  text-align: left;
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 1.1rem;
  min-width: 3.4rem;
`

const MatchText = styled.span`
  color: ${({ theme }) => theme.color.foreground};
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: pre;
  font-size: 1.1rem;
  
  mark {
    background-color: rgb(163,127,96);
    border-radius: 0.2rem;
    color: ${({ theme }) => theme.color.foreground};
    padding: 0.2rem;
  }
`

const NoResults = styled.div`
  padding: 2rem 1.2rem;
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.3rem;
  text-align: center;
`

type FlattenedItem = { isMetricsMatch: boolean } & (
  | { type: 'header'; bufferId: number; bufferLabel: string; isArchived: boolean; matchCount: number; id: string; parentId?: string; titleMatch?: SearchMatch }
  | { type: 'match'; match: SearchMatch; id: string; parentId: string }
  | { type: 'title-match'; match: SearchMatch; id: string }
)

interface SearchResultsProps {
  groupedMatches: Map<number, SearchMatch[]>
  searchQuery: string
}

const SearchResultsComponent: React.FC<SearchResultsProps> = ({
  groupedMatches,
  searchQuery,
}) => {
  const { setActiveBuffer, buffers, setTemporaryBuffer, temporaryBufferId, editorRef, updateBuffer } = useEditor()
  const [expandedBuffers, setExpandedBuffers] = useState<Map<number, boolean>>(
    new Map(Array.from(groupedMatches.keys()).map(id => [id, true]))
  )
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const selectionDecorations = useRef<string[]>([])
  const virtualizedTreeRef = useRef<VirtualizedTreeHandle>(null)
  const searchResultsRef = useRef<HTMLDivElement>(null)

  const activeBufferCount = useMemo(() => 
    buffers.filter(b => !b.archived || b.isTemporary).length, 
    [buffers]
  )

  const flattenedItems = useMemo(() => {
    const items: FlattenedItem[] = []
    
    Array.from(groupedMatches.entries()).forEach(([bufferId, matches]) => {
      const firstMatch = matches[0]
      
      const onlyTitleMatches = matches.every(m => m.isTitleMatch)
      const titleMatch = matches.find(m => m.isTitleMatch)
      
      if (onlyTitleMatches) {
        matches.forEach((match, index) => {
          items.push({
            type: 'title-match',
            match,
            id: `title-match-${bufferId}-${index}`,
            isMetricsMatch: !!firstMatch.isMetricsMatch,
          })
        })
      } else {
        const headerId = `header-${bufferId}`
        
        items.push({
          type: 'header',
          bufferId,
          bufferLabel: firstMatch.bufferLabel,
          isArchived: firstMatch.isArchived || false,
          matchCount: matches.length - (titleMatch ? 1 : 0),
          id: headerId,
          titleMatch: titleMatch,
          isMetricsMatch: !!firstMatch.isMetricsMatch,
        })
        
        if (expandedBuffers.get(bufferId) === true) {
          matches.forEach((match, index) => {
            if (!match.isTitleMatch) {
              items.push({
                type: 'match',
                match,
                id: `match-${bufferId}-${match.range.startLineNumber}-${match.range.startColumn}-${index}`,
                parentId: headerId,
                isMetricsMatch: !!match.isMetricsMatch,
              })
            }
          })
        }
      }
    })
    
    return items
  }, [groupedMatches, expandedBuffers])

  const convertTemporaryToPermanent = useCallback(async () => {
    if (temporaryBufferId !== null) {
      const tempBuffer = buffers.find(b => b.id === temporaryBufferId)
      const updatedFields = {
        archived: false,
        archivedAt: undefined,
        isTemporary: false,
      }
      
      if (tempBuffer) {
        await updateBuffer(temporaryBufferId, updatedFields)
        await setActiveBuffer({ ...tempBuffer, ...updatedFields }, { focus: true, fromSearch: true })
        
        return tempBuffer
      }
    }
    return null
  }, [temporaryBufferId, buffers, updateBuffer, setActiveBuffer])

  const toggleBufferExpansion = useCallback((bufferId: number) => {
    setExpandedBuffers(prev => {
      const newMap = new Map(prev)
      const currentState = newMap.get(bufferId) ?? true
      newMap.set(bufferId, !currentState)
      return newMap
    })
  }, [])

  const getBufferIdFromItem = useCallback((item: FlattenedItem): number | undefined => {
    if (item.type === 'header') return item.bufferId
    if (item.type === 'match' || item.type === 'title-match') return item.match.bufferId
    return undefined
  }, [])

  const openBufferFromItem = useCallback(async (item: FlattenedItem, shouldFocus: boolean) => {
    const bufferId = getBufferIdFromItem(item)
    if (!bufferId) return null

    const buffer = buffers?.find(b => b.id === bufferId)
    if (!buffer) return null

    if (!buffer.archived) {
      if (temporaryBufferId !== null) {
        await updateBuffer(temporaryBufferId, { isTemporary: false })
      }
      await setActiveBuffer(buffer, { focus: shouldFocus, fromSearch: true })
    } else {
      if (shouldFocus) {
        // Double-click on archived buffer
        if (temporaryBufferId !== null && temporaryBufferId === bufferId) {
          await convertTemporaryToPermanent()
        } else {
          await updateBuffer(bufferId, {
            archived: false,
            archivedAt: undefined,
            position: activeBufferCount,
          })
          await setActiveBuffer(buffer, { focus: true, fromSearch: true })
          
          if (temporaryBufferId !== null) {
            await updateBuffer(temporaryBufferId, { isTemporary: false })
          }
        }
      } else {
        // Single-click on archived buffer
        if (temporaryBufferId !== bufferId) {
          await setTemporaryBuffer(buffer)
        }
      }
    }
  }, [getBufferIdFromItem, buffers, temporaryBufferId, updateBuffer, setActiveBuffer, 
      convertTemporaryToPermanent, activeBufferCount, setTemporaryBuffer])

  const positionEditorForItem = useCallback((item: FlattenedItem) => {
    if (item.isMetricsMatch) {
      return
    }

    if (item.type === 'header' || item.type === 'title-match') {
      editorRef.current?.revealPositionInCenter({ lineNumber: 1, column: 1 })
      editorRef.current?.setPosition({ lineNumber: 1, column: 1 })
      selectionDecorations.current = editorRef.current?.getModel()?.deltaDecorations(selectionDecorations.current, []) ?? []
    } else if (item.type === 'match') {
      // Content matches position at specific line and highlight
      editorRef.current?.revealPositionInCenter({
        lineNumber: item.match.range.startLineNumber,
        column: item.match.range.startColumn
      })
      editorRef.current?.setPosition({
        lineNumber: item.match.range.startLineNumber,
        column: item.match.range.startColumn
      })
      selectionDecorations.current = editorRef.current?.getModel()?.deltaDecorations(selectionDecorations.current, [
        {
          range: item.match.range,
          options: {
            isWholeLine: false,
            className: 'searchHighlight',
          }
        }
      ]) ?? []
    }
  }, [editorRef])

  const handleClick = async (focusedIndex: number | null) => {
    if (focusedIndex === null) {
      selectionDecorations.current = editorRef.current?.getModel()?.deltaDecorations(selectionDecorations.current, []) ?? []
      return
    }

    const item = flattenedItems.at(focusedIndex)
    if (!item) {
      return
    }

    await openBufferFromItem(item, false)
    positionEditorForItem(item)
  }

  const handleDoubleClick = async (item: FlattenedItem) => {
    if (!item) {
      return
    }
    await openBufferFromItem(item, true)
    positionEditorForItem(item)
    
    if (!item.isMetricsMatch) {
      editorRef.current?.focus()
    } else {
      setFocusedIndex(null)
    }
  }

  const handleItemKeyDown = (item: FlattenedItem, _index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleDoubleClick(item)
    }

    if (item.type === 'header') {
      const isExpanded = expandedBuffers.get(item.bufferId) === true
      
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (!isExpanded) {
          toggleBufferExpansion(item.bufferId)
        } else {
          virtualizedTreeRef.current?.navigateInTree({ to: 'next', id: item.id })
        }
        return
      }
      
      if (e.key === 'ArrowLeft' && isExpanded) {
        e.preventDefault()
        toggleBufferExpansion(item.bufferId)
        return
      }
      
    } else if (item.type === 'match') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const parentIndex = flattenedItems.findIndex(i => i.id === item.parentId)
        if (parentIndex !== -1 && virtualizedTreeRef.current) {
          virtualizedTreeRef.current.scrollToIndex(parentIndex)
        }
        return
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        virtualizedTreeRef.current?.navigateInTree({ to: 'next', id: item.id })
        return
      }
    }
  }

  const renderHighlightedTextAtPosition = useCallback((text: string, matchStart: number, matchEnd: number) => {
    const beforeMatch = text.substring(0, matchStart)
    const matchText = text.substring(matchStart, matchEnd)
    const afterMatch = text.substring(matchEnd)
    
    return (
      <span>
        {beforeMatch}
        <mark>{matchText}</mark>
        {afterMatch}
      </span>
    )
  }, [])

  const renderItem = useCallback((item: FlattenedItem, _index: number, isFocused: boolean) => {
    if (item.type === 'header') {
      const isExpanded = expandedBuffers.get(item.bufferId) === true
      
      return (
        <ItemWrapper $focused={isFocused} $isHeader $level={1} data-hook="search-result-buffer-group" data-active={isFocused}>
          <ChevronIcon onClick={(e) => {
            e.stopPropagation()
            toggleBufferExpansion(item.bufferId)
          }}>
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </ChevronIcon>
          <FileIcon>
            {item.isMetricsMatch ? <InsertChart /> : <FileText />}
          </FileIcon>
          <ItemText $isArchived={item.isArchived}>
            {item.titleMatch 
              ? renderHighlightedTextAtPosition(
                  item.titleMatch.previewText, 
                  item.titleMatch.matchStartInPreview, 
                  item.titleMatch.matchEndInPreview
                )
              : item.bufferLabel
            }
            {item.isArchived && <BufferStatus>closed</BufferStatus>}
          </ItemText>
          <MatchCount>{item.matchCount > 1 ? `${item.matchCount} results` : `${item.matchCount} result`}</MatchCount>
        </ItemWrapper>
      )
    } else if (item.type === 'title-match') {
      return (
        <ItemWrapper $focused={isFocused} $level={1} data-hook="search-result-title-match" data-active={isFocused}>
          <FileIcon data-hook="search-result-title-match-icon">
            {item.isMetricsMatch ? <InsertChart /> : <FileText />}
          </FileIcon>
          <ItemText $isArchived={item.match.isArchived} data-hook="search-result-title-match-text">
            {renderHighlightedTextAtPosition(
              item.match.previewText, 
              item.match.matchStartInPreview, 
              item.match.matchEndInPreview
            )}
            {item.match.isArchived && <BufferStatus data-hook="search-result-title-match-closed-status">closed</BufferStatus>}
          </ItemText>
        </ItemWrapper>
      )
    } else {
      return (
        <ItemWrapper $focused={isFocused} $level={2} data-hook="search-result-match" data-active={isFocused}>
          <LineNumber data-hook="search-result-line-number">{item.match.range.startLineNumber}</LineNumber>
          <MatchText>
            {renderHighlightedTextAtPosition(
              item.match.previewText, 
              item.match.matchStartInPreview, 
              item.match.matchEndInPreview
            )}
          </MatchText>
        </ItemWrapper>
      )
    }
  }, [expandedBuffers, toggleBufferExpansion, renderHighlightedTextAtPosition])

  useEffect(() => {
    handleClick(focusedIndex)
  }, [focusedIndex])

  useEffect(() => {
    setExpandedBuffers(prevMap => {
      const newMap = new Map(prevMap)
      Array.from(groupedMatches.keys()).forEach(id => {
        if (!newMap.has(id)) {
          newMap.set(id, true)
        }
      })
      Array.from(newMap.keys()).forEach(id => {
        if (!groupedMatches.has(id)) {
          newMap.delete(id)
        }
      })
      return newMap
    })
  }, [groupedMatches])

  useEffect(() => {
    const handleGlobalClick = async (event: MouseEvent) => {
      if (searchResultsRef.current && !searchResultsRef.current.contains(event.target as Node)) {
        if (temporaryBufferId !== null) {
          if (event.target instanceof HTMLElement && (
            event.target.closest(".monaco-editor") || event.target.closest(".metrics-root")
          )) {
            await convertTemporaryToPermanent()
          } else {
            await updateBuffer(temporaryBufferId, { isTemporary: false }, true)
          }
        }
      }
    }
    document.addEventListener('click', handleGlobalClick)

    return () => {
      document.removeEventListener('click', handleGlobalClick)
    }
  }, [temporaryBufferId, updateBuffer, convertTemporaryToPermanent, flattenedItems])

  if (groupedMatches.size === 0 && searchQuery.trim()) {
    return (
      <NoResults data-hook="search-no-results">
        No results found
      </NoResults>
    )
  }

  return (
    <ResultsContainer ref={searchResultsRef} tabIndex={-1}>
      <VirtualizedTree
        ref={virtualizedTreeRef}
        items={flattenedItems}
        renderItem={renderItem}
        onItemDoubleClick={handleDoubleClick}
        onItemKeyDown={handleItemKeyDown}
        focusedIndex={focusedIndex}
        setFocusedIndex={setFocusedIndex}
      />
    </ResultsContainer>
  )
}

export const SearchResults = React.memo(SearchResultsComponent, (prevProps, nextProps) => {
  return prevProps.groupedMatches === nextProps.groupedMatches
})