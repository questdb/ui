import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Error as ErrorIcon } from '@styled-icons/boxicons-regular'
import styled, { css } from 'styled-components'
import { Checkbox, Input, LoadingSpinner, PaneWrapper, PaneContent } from '../../components'
import { SearchService, SearchResult, SearchProgress } from './service'
import { SearchOptions, SearchMatch } from '../../utils/textSearch'
import { bufferStore } from '../../store/buffers'
import { SearchResults } from './SearchResults'
import { eventBus } from '../../modules/EventBus'
import { EventType } from '../../modules/EventBus/types'
import { useSearch } from '../../providers'
import { db } from '../../store/db'
import { color } from '../../utils'
import { useEffectIgnoreFirst } from '../../hooks'
import { SearchTimeoutError, SearchCancelledError, terminateSearchWorker } from '../../utils/textSearch'

export type BufferUpdatePayload =
  | { type: 'update', bufferId: number, metaUpdate: boolean, contentUpdate: boolean }
  | { type: 'archive', bufferId: number }
  | { type: 'delete', bufferId: number }
  | { type: 'deleteAll' }

type PendingUpdate = {
  delete: boolean
  metaUpdate: boolean
  contentUpdate: boolean
}

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
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4rem;
  padding: 1rem;
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.1rem;
`

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  padding: 0.4rem 0;
  
  input {
    margin-left: 0;
  }
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

const SearchError = styled.div`
  background: transparent;;

  border-radius: 0.4rem;
  margin: 0.5rem 0 1rem 0;
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.2rem;
  align-items: center;
  gap: 0.8rem;
  
  svg {
    display: inline;
    color: ${({ theme }) => theme.color.red};
    align-self: flex-start;
    width: 1.6rem;
    height: 1.6rem;
    margin-right: 0.3rem;
    flex-shrink: 0;
    transform: translateY(-0.1rem);
  }
`

const LoaderContainer = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  gap: 0.5rem;
  color: ${color("offWhite")};
`

const DelayedLoader = () => {
  const [render, setRender] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setRender(true)
    }, 1500)

    return () => clearTimeout(timeout)
  }, [])

  if (!render) {
    return null
  }

  return (
    <LoaderContainer>
      <LoadingSpinner />
      Searching...
    </LoaderContainer>
  )
}

interface SearchPanelProps {
  open?: boolean
}

export interface SearchPanelRef {
  focusSearchInput: () => void
}

const createErrorTermsString = (query: string, options: SearchOptions) => {
  return JSON.stringify({ query, options })
}

export const SearchPanel = React.forwardRef<SearchPanelRef, SearchPanelProps>(({ open }, ref) => {
  const { setSearchPanelOpen } = useSearch()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    includeDeleted: true,
  })
  const [searchResult, setSearchResult] = useState<SearchResult>({ query: '', matches: [] })
  const [staleBuffers, setStaleBuffers] = useState<number[]>([])
  const [searchError, setSearchError] = useState<{type: string, message: string} | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const searchVersionRef = useRef(0)
  const searchInProgressRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastErrorTermsRef = useRef<string | null>(null)

  const pendingUpdatesRef = useRef<Record<number, Record<number, PendingUpdate>>>({})
  const currentSearchResultRef = useRef<SearchResult>(searchResult)
  const currentStaleBuffersRef = useRef<number[]>([])
  const bufferSearchTimesRef = useRef<Record<number, { duration: number; query: string }>>({})
  const singleSearchAbortControllersRef = useRef<Map<number, AbortController>>(new Map())

  useEffect(() => {
    currentSearchResultRef.current = searchResult
  }, [searchResult])

  useEffect(() => {
    currentStaleBuffersRef.current = staleBuffers
  }, [staleBuffers])

  const performSearch = useCallback(async () => {
    const currentVersion = ++searchVersionRef.current

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    if (createErrorTermsString(searchQuery, searchOptions) === lastErrorTermsRef.current) {
      return
    }
    if (!searchQuery.trim()) {
      setSearchResult({ query: searchQuery, matches: [] })
      setIsSearching(false)
      setSearchError(null)
      return
    }
    
    const allBuffers = await bufferStore.getAll()
    if (!allBuffers || allBuffers.length === 0) {
      setSearchResult({ query: searchQuery, matches: [] })
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchInProgressRef.current = true
    
    if (searchQuery !== currentSearchResultRef.current.query) {
      bufferSearchTimesRef.current = {}
    }
    
    try {
      setSearchError(null)
      setStaleBuffers([])
      let currentMatches: SearchMatch[] = []
      
      const generator = SearchService.searchInBuffers(allBuffers, searchQuery, searchOptions, abortController.signal, currentVersion.toString())
      
      while (true) {
        const { value, done } = await generator.next()

        if (abortController.signal.aborted) {
          throw new SearchCancelledError()
        }

        if (done) {
          const result = value as SearchResult
          if (currentVersion === searchVersionRef.current) {
            setSearchResult(result)
            lastErrorTermsRef.current = null
          }
          break
        }
        
        const progress = value as SearchProgress
        if (progress && currentVersion === searchVersionRef.current) {
          if (progress.bufferId && progress.searchDuration !== undefined) {
            bufferSearchTimesRef.current[progress.bufferId] = {
              duration: progress.searchDuration,
              query: searchQuery
            }
          }
          
          if (progress.currentMatches.length > 0) {
            currentMatches = [...currentMatches, ...progress.currentMatches]
            setSearchResult({
              query: searchQuery,
              matches: currentMatches,
            })
          }
        }
      }
    } catch (e) {
      if (e instanceof SearchCancelledError) {
        return
      }
      
      if (currentVersion === searchVersionRef.current) {
        const error = e as Error
        
        if (e instanceof SearchTimeoutError) {
          // Partial matches contains all matches from multiple buffers before the timeout
          const partialMatches = e.partialSearchMatches || []
          setSearchResult({ 
            query: searchQuery, 
            matches: partialMatches, 
            limitReached: true
          })
          setSearchError({type: 'timeout', message: error.message })
          lastErrorTermsRef.current = createErrorTermsString(searchQuery, searchOptions)
        } else {
          setSearchResult({ query: searchQuery, matches: [] })
          setSearchError({ type: error.name, message: error.message })
          lastErrorTermsRef.current = createErrorTermsString(searchQuery, searchOptions)
        }
      }
    } finally {
      if (currentVersion === searchVersionRef.current) {
        setIsSearching(false)
        searchInProgressRef.current = false
        
        const pendingForCurrentVersion = pendingUpdatesRef.current[currentVersion]
        if (pendingForCurrentVersion && Object.keys(pendingForCurrentVersion).length > 0) {
          setTimeout(async () => {
            const currentResult = currentSearchResultRef.current
            const currentStaleBuffers = currentStaleBuffersRef.current
            
            const { result, staleBuffers: newStaleBuffers, buffersToRefresh } = await applyPatchesByVersion(
              currentVersion,
              currentResult,
              currentStaleBuffers
            )
            
            if (currentVersion === searchVersionRef.current) {
              setSearchResult(result)
              setStaleBuffers(newStaleBuffers)
              
              if (buffersToRefresh.length > 0) {
                await refreshBuffers(buffersToRefresh)
              }
            }
          }, 100)
        }
      }
    }
  }, [searchQuery, searchOptions])

  const performSingleSearch = useCallback(async (bufferId: number, abortSignal: AbortSignal, limit: number): Promise<SearchMatch[]> => {
    try {
      const buffer = await bufferStore.getById(bufferId)
      if (!buffer || abortSignal.aborted) {
        return []
      }
      
      const matches = await SearchService.searchInSingleBuffer(
        buffer,
        searchQuery,
        searchOptions,
        abortSignal,
        `queue-${bufferId}-${Date.now()}`,
        limit
      )
      
      return matches
    } catch (e) {
      if (e instanceof SearchCancelledError) {
        return []
      }
      return []
    }
  }, [searchQuery, searchOptions, bufferStore])

  const refreshBuffers = async (bufferIds: number[]) => {
    for (const bufferId of bufferIds) {
      const existingController = singleSearchAbortControllersRef.current.get(bufferId)
      if (existingController) {
        existingController.abort()
      }
      
      const abortController = new AbortController()
      singleSearchAbortControllersRef.current.set(bufferId, abortController)
      
      try {
        const newMatches = await performSingleSearch(bufferId, abortController.signal, 10000)
        
        setSearchResult(prev => {
          const firstMatchIndex = prev.matches.findIndex(m => m.bufferId === bufferId)
          const filteredMatches = prev.matches.filter(m => m.bufferId !== bufferId)
          
          if (firstMatchIndex === -1 || newMatches.length === 0) {
            return {
              ...prev,
              matches: [...filteredMatches, ...newMatches]
            }
          } else {
            const before = filteredMatches.slice(0, firstMatchIndex)
            const after = filteredMatches.slice(firstMatchIndex)
            return {
              ...prev,
              matches: [...before, ...newMatches, ...after]
            }
          }
        })
        
        setStaleBuffers(prev => prev.filter(id => id !== bufferId))
      } catch (error) {
        if (error instanceof SearchCancelledError) {
          continue
        }
        setStaleBuffers(prev => [...prev.filter(id => id !== bufferId), bufferId])
      } finally {
        singleSearchAbortControllersRef.current.delete(bufferId)
      }
    }
  }

  const applyPatchesByVersion = async (version: number, searchResult: SearchResult, staleBuffers: number[]): Promise<{ result: SearchResult; staleBuffers: number[]; buffersToRefresh: number[] }> => {
    const currentVersionUpdates = pendingUpdatesRef.current[version]
    if (!currentVersionUpdates) {
      return { result: searchResult, staleBuffers, buffersToRefresh: [] }
    }

    let updatedMatches = [...searchResult.matches]
    let updatedStaleBuffers = [...staleBuffers]
    const buffersToRefresh: number[] = []

    for (const [bufferId, update] of Object.entries(currentVersionUpdates)) {
      const { delete: deleteUpdate, metaUpdate, contentUpdate: contentUpdateInitial } = update
      const bufferIdNum = Number(bufferId)
      let contentUpdate = contentUpdateInitial

      if (deleteUpdate) {
        updatedMatches = updatedMatches.filter(match => match.bufferId !== bufferIdNum)
        updatedStaleBuffers = updatedStaleBuffers.filter(id => id !== bufferIdNum)
      }

      if (metaUpdate) {
        const bufferMeta = await bufferStore.getMetaById(bufferIdNum)
        if (bufferMeta) {
          updatedMatches = updatedMatches.map(match => {
            if (match.isTitleMatch) {
              contentUpdate = true
            }
            return match.bufferId === bufferIdNum ? {
              ...match,
              bufferLabel: bufferMeta.label!,
              isArchived: bufferMeta.archived,
              archivedAt: bufferMeta.archivedAt,
            } : match
          })
        }
      }

      if (contentUpdate) {
        const isNewBuffer = !bufferSearchTimesRef.current[bufferIdNum]
        const isFastBuffer = bufferSearchTimesRef.current[bufferIdNum]?.query === searchQuery &&
                            (bufferSearchTimesRef.current[bufferIdNum]?.duration || 0) < 5000
        
        if (isNewBuffer || isFastBuffer) {
          buffersToRefresh.push(bufferIdNum)
        } else {
          if (!updatedStaleBuffers.includes(bufferIdNum)) {
            updatedStaleBuffers.push(bufferIdNum)
          }
        }
      }
    }

    delete pendingUpdatesRef.current[version]

    return {
      result: {
        ...searchResult,
        matches: updatedMatches
      },
      staleBuffers: updatedStaleBuffers,
      buffersToRefresh
    }
  }

  useEffect(() => {
    const handleBuffersUpdated = async (payload?: BufferUpdatePayload) => {
      if (!payload || searchQuery.trim() === '') {
        return
      }

      const { type } = payload

      if (type !== 'deleteAll') {
        pendingUpdatesRef.current[searchVersionRef.current] = pendingUpdatesRef.current[searchVersionRef.current] || {}
      }
      const currentVersionUpdate = pendingUpdatesRef.current[searchVersionRef.current]

      switch (type) {
        case 'deleteAll':
          searchVersionRef.current++
          if (abortControllerRef.current) {
            abortControllerRef.current.abort()
          }
          setSearchResult({ query: searchQuery, matches: [] })
          pendingUpdatesRef.current = {}
          setStaleBuffers([])
          break

        case 'delete':
          const { bufferId: deleteBufferId } = payload
          if (currentVersionUpdate) {
            currentVersionUpdate[deleteBufferId] = {
              delete: true,
              metaUpdate: false,
              contentUpdate: false,
            }
          }
          break

        case 'update':
          const { bufferId } = payload
          if (currentVersionUpdate) {
            currentVersionUpdate[bufferId] = {
              delete: currentVersionUpdate[bufferId]?.delete,
              metaUpdate: payload?.metaUpdate || currentVersionUpdate[bufferId]?.metaUpdate,
              contentUpdate: payload?.contentUpdate || currentVersionUpdate[bufferId]?.contentUpdate,
            }
          }
          break
        
        case 'archive':
          const { bufferId: archiveBufferId } = payload
          if (currentVersionUpdate) {
            currentVersionUpdate[archiveBufferId] = {
              delete: currentVersionUpdate[archiveBufferId]?.delete,
              metaUpdate: true,
              contentUpdate: currentVersionUpdate[archiveBufferId]?.contentUpdate,
            }
          }
          break

        default:
          break
      }
      if (!searchInProgressRef.current) {
        (async () => {
          const currentResult = currentSearchResultRef.current
          const currentStaleBuffers = currentStaleBuffersRef.current
          const currentVersion = searchVersionRef.current
          
          if (!('bufferId' in payload) || !payload.bufferId) {
            return
          }
          
          const { result, staleBuffers: newStaleBuffers, buffersToRefresh } = await applyPatchesByVersion(
            currentVersion, 
            currentResult, 
            currentStaleBuffers
          )
          
          setSearchResult(result)
          setStaleBuffers(newStaleBuffers)
          
          if (buffersToRefresh.length > 0) {
            await refreshBuffers(buffersToRefresh)
          }
        })()
      }
    }
    
    eventBus.subscribe(EventType.BUFFERS_UPDATED, handleBuffersUpdated)
    
    return () => {
      eventBus.unsubscribe(EventType.BUFFERS_UPDATED, handleBuffersUpdated)
      singleSearchAbortControllersRef.current.forEach(controller => {
        controller.abort()
      })
      singleSearchAbortControllersRef.current.clear()
    }
  }, [searchQuery])

  useEffectIgnoreFirst(() => {
    const timeoutId = setTimeout(() => {
      if (!db.ready) {
        return
      }

      performSearch()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [performSearch])

  useEffectIgnoreFirst(() => {
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
  }, [searchResult])

  const getSummaryText = useCallback(() => {
    if (!searchQuery.trim()) return ''
    
    const bufferCount = groupedMatches.size
    const matchCount = searchResult.matches.length
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

  React.useImperativeHandle(ref, () => ({
    focusSearchInput: focusSearchInput
  }), [focusSearchInput])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      terminateSearchWorker()
    }
  }, [])

  return (
    <Wrapper $open={open}>
      <Content>
        <SearchInputContainer>
          <InputWrapper>
            <StyledInput
              ref={inputRef}
              placeholder="Search in tabs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  performSearch()
                } else if (e.key === 'Escape') {
                  if (searchQuery.length > 0) {
                    setSearchQuery('')
                  } else {
                    setSearchPanelOpen(false)
                  }
                }
              }}
              aria-label="Search in tabs"
              aria-describedby="search-summary"
              data-hook="search-input"
            />
            <ToggleButtonsContainer>
              <ToggleButton
                active={searchOptions.caseSensitive || false}
                onClick={() => toggleOption('caseSensitive')}
                title="Match Case (Alt+C)"
                aria-label="Match Case"
                aria-pressed={searchOptions.caseSensitive || false}
                data-hook="search-option-case-sensitive"
              >
                Aa
              </ToggleButton>
              <ToggleButton
                active={searchOptions.wholeWord || false}
                onClick={() => toggleOption('wholeWord')}
                title="Match Whole Word (Alt+W)"
                aria-label="Match Whole Word"
                aria-pressed={searchOptions.wholeWord || false}
                data-hook="search-option-whole-word"
              >
                W
              </ToggleButton>
              <ToggleButton
                active={searchOptions.useRegex || false}
                onClick={() => toggleOption('useRegex')}
                title="Use Regular Expression (Alt+R)"
                aria-label="Use Regular Expression"
                aria-pressed={searchOptions.useRegex || false}
                data-hook="search-option-regex"
              >
                .*
              </ToggleButton>
            </ToggleButtonsContainer>
          </InputWrapper>
          
          <CheckboxWrapper>
            <Checkbox
              id="search-include-closed"
              checked={searchOptions.includeDeleted || false}
              onChange={() => toggleOption('includeDeleted')}
              aria-describedby="search-include-closed-label"
              data-hook="search-option-include-closed"
            />
            <CheckboxLabel 
              id="search-include-closed-label"
              htmlFor="search-include-closed"
              data-hook="search-option-include-closed-label"
            >
              Include closed tabs
            </CheckboxLabel>
          </CheckboxWrapper>
          {searchError && (
            <SearchError data-hook="search-error">
              <ErrorIcon />
              {searchError.message}
            </SearchError>
          )}
        </SearchInputContainer>

        <SearchSummary data-hook="search-summary">
          {getSummaryText()}
          {isSearching && <DelayedLoader />}
        </SearchSummary>

        <SearchResultsContainer>
          {!isSearching || groupedMatches.size > 0 ? (
            <SearchResults
              groupedMatches={groupedMatches}
              searchQuery={searchQuery}
              staleBuffers={staleBuffers}
            />
          ) : null} 
        </SearchResultsContainer>
      </Content>
    </Wrapper>
  )
})