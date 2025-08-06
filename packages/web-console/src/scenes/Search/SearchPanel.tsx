import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import styled, { css } from 'styled-components'
import { Input, Checkbox } from '@questdb/react-components'
import { PaneWrapper, PaneContent } from '../../components'
import { SearchService, SearchResult, SearchOptions } from '../../services/search'
import { bufferStore } from '../../store/buffers'
import { SearchResults } from './SearchResults'
import { eventBus } from '../../modules/EventBus'
import { EventType } from '../../modules/EventBus/types'

const Wrapper = styled(PaneWrapper)<{
  $open?: boolean
}>`
  overflow-x: auto;
  height: 100%;
  ${({ $open }) => !$open && css`
    display: none;
  `}
`

const Content = styled(PaneContent)`
  display: flex;
  flex-direction: column;
  overflow: auto;
`

const SearchInputContainer = styled.div`
  padding: 0 1rem 0.5rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.selection};
`

const InputWrapper = styled.div`
  position: relative;
  height: 4.5rem;
  display: flex;
  align-items: center;
  width: 100%;
`

const StyledInput = styled(Input)`
  padding-right: 8rem;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }

  &::selection {
    background: rgba(255, 255, 255, 0.3);
    color: inherit;
  }
`


const ToggleButtonsContainer = styled.div`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 0.2rem;
`

const ToggleButton = styled.button<{ active: boolean }>`
  background: transparent;
  border: 1px solid transparent;
  color: ${({ theme }) => theme.color.foreground};
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 0.2rem;
  font-size: 1.2rem;

  ${({ active, theme }) => active && `
    background: ${theme.color.background};
    border: 1px solid ${theme.color.pink};
  `}
`

const SearchSummary = styled.div`
  padding: 1rem;
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.1rem;
`

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  padding: 0.4rem 0;
`

const CheckboxLabel = styled.label`
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.2rem;
  margin-left: 0.6rem;
  cursor: pointer;
`

const SearchResultsContainer = styled.div`
  flex: 1;
  overflow-y: auto;
`

interface SearchPanelProps {
  open?: boolean
}

// Create a ref interface for external access to search functionality
export interface SearchPanelRef {
  refreshSearch: () => void
  focusSearchInput: () => void
}

export const SearchPanel = React.forwardRef<SearchPanelRef, SearchPanelProps>(({ open }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    includeDeleted: true,
  })
  const [searchResult, setSearchResult] = useState<SearchResult>({ query: '', matches: [], totalMatches: 0 })

  const performSearch = useCallback(async () => {
    const allBuffers = await bufferStore.getAll()
    
    if (!allBuffers || allBuffers.length === 0) {
      setSearchResult({ query: searchQuery, matches: [], totalMatches: 0 })
      return
    }

    const result = SearchService.searchInBuffers(allBuffers, searchQuery, searchOptions)
    setSearchResult(result)
  }, [searchQuery, searchOptions])

  useEffect(() => {
    const handleBuffersUpdated = () => {
      performSearch()
    }
    
    eventBus.subscribe(EventType.BUFFERS_UPDATED, handleBuffersUpdated)
    
    return () => {
      eventBus.unsubscribe(EventType.BUFFERS_UPDATED, handleBuffersUpdated)
    }
  }, [performSearch])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [performSearch])

  useEffect(() => {
    if (inputRef.current && open) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [open])

  const toggleOption = (option: keyof SearchOptions) => {
    setSearchOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }))
  }

  const groupedMatches = useMemo(() => {
    return SearchService.groupMatchesByBuffer(searchResult.matches)
  }, [searchResult.matches])

  const getSummaryText = useCallback(() => {
    if (!searchQuery.trim()) return ''
    
    const bufferCount = groupedMatches.size
    const matchCount = searchResult.totalMatches
    const limited = searchResult.limitReached
    
    if (matchCount === 0) {
      return null
    }
    
    return `${limited ? `${matchCount}+` : matchCount} result${matchCount !== 1 ? 's' : ''} in ${bufferCount} tab${bufferCount !== 1 ? 's' : ''}`
  }, [groupedMatches])

  const focusSearchInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    refreshSearch: performSearch,
    focusSearchInput: focusSearchInput
  }), [performSearch, focusSearchInput])

  return (
    <Wrapper $open={open}>
      <Content>
        <SearchInputContainer>
          <InputWrapper>
            <StyledInput
              ref={inputRef}
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  performSearch()
                }
              }}
            />
            <ToggleButtonsContainer>
              <ToggleButton
                active={searchOptions.caseSensitive || false}
                onClick={() => toggleOption('caseSensitive')}
                title="Match Case (Alt+C)"
              >
                Aa
              </ToggleButton>
              <ToggleButton
                active={searchOptions.wholeWord || false}
                onClick={() => toggleOption('wholeWord')}
                title="Match Whole Word (Alt+W)"
              >
                W
              </ToggleButton>
              <ToggleButton
                active={searchOptions.useRegex || false}
                onClick={() => toggleOption('useRegex')}
                title="Use Regular Expression (Alt+R)"
              >
                .*
              </ToggleButton>
            </ToggleButtonsContainer>
          </InputWrapper>
          
          <CheckboxWrapper>
            <Checkbox
              checked={searchOptions.includeDeleted || false}
              onChange={() => toggleOption('includeDeleted')}
            />
            <CheckboxLabel>Include closed tabs</CheckboxLabel>
          </CheckboxWrapper>
        </SearchInputContainer>

        {getSummaryText() && (
          <SearchSummary>
            {getSummaryText()}
          </SearchSummary>
        )}

        <SearchResultsContainer>
          <SearchResults
            groupedMatches={groupedMatches}
            searchQuery={searchQuery}
            searchOptions={searchOptions}
          />
        </SearchResultsContainer>
      </Content>
    </Wrapper>
  )
})