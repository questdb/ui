import React, { createContext, useContext, PropsWithChildren, useCallback, useEffect, useRef } from 'react'
import { useLocalStorage } from '../LocalStorageProvider'
import { LeftPanelType, LeftPanelState } from '../LocalStorageProvider/types'
import { getValue, setValue } from '../../utils/localStorage'
import { SearchPanelRef } from '../../scenes/Search/SearchPanel'

export interface SearchState {
  isSearchPanelOpen: boolean
  setSearchPanelOpen: (open: boolean) => void
  toggleSearchPanel: () => void
  searchPanelRef: React.RefObject<SearchPanelRef>
}

const defaultValues: SearchState = {
  isSearchPanelOpen: false,
  setSearchPanelOpen: () => {},
  toggleSearchPanel: () => {},
  searchPanelRef: { current: null },
}

const SearchContext = createContext<SearchState>(defaultValues)

export const SearchProvider = ({ children }: PropsWithChildren<{}>) => {
  const { leftPanelState, updateLeftPanelState } = useLocalStorage()
  const isSearchPanelOpen = leftPanelState.type === LeftPanelType.SEARCH
  const searchPanelRef = useRef<SearchPanelRef>(null)

  const setSearchPanelOpen = useCallback((open: boolean) => {
    if (open) {
      updateLeftPanelState({
        type: LeftPanelType.SEARCH,
        width: leftPanelState.width
      })
    } else {
      updateLeftPanelState({
        type: null,
        width: leftPanelState.width
      })
    }
  }, [leftPanelState.width, updateLeftPanelState])

  const toggleSearchPanel = useCallback(() => {
    const getCurrentState = (): LeftPanelState => {
      const stored = getValue("left.panel.state" as any)
      if (stored) {
        try {
          return JSON.parse(stored) as LeftPanelState
        } catch (e) {
          return { type: null, width: 350 }
        }
      }
      return { type: null, width: 350 }
    }
    
    const currentState = getCurrentState()
    const isCurrentlyOpen = currentState.type === LeftPanelType.SEARCH
    
    const newState: LeftPanelState = {
      type: isCurrentlyOpen ? null : LeftPanelType.SEARCH,
      width: currentState.width
    }
    
    setValue("left.panel.state" as any, JSON.stringify(newState))
    updateLeftPanelState(newState)
  }, [updateLeftPanelState])

  const handleGlobalSearch = useCallback((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 'f' || event.key === 'F')) {
      event.preventDefault()
      setSearchPanelOpen(true)
      setTimeout(() => {
        searchPanelRef.current?.focusSearchInput()
      }, 100)
    }
  }, [setSearchPanelOpen])

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalSearch)
    return () => {
      document.removeEventListener('keydown', handleGlobalSearch)
    }
  }, [handleGlobalSearch])

  return (
    <SearchContext.Provider
      value={{
        isSearchPanelOpen,
        setSearchPanelOpen,
        toggleSearchPanel,
        searchPanelRef,
      }}
    >
      {children}
    </SearchContext.Provider>
  )
}

export const useSearch = () => useContext(SearchContext)