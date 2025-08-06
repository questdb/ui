import type { IRange } from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import { QuestDBLanguageName } from '../scenes/Editor/Monaco/utils'

export interface SearchMatch {
  bufferId: number
  bufferLabel: string
  range: IRange
  text: string
  previewText: string
  isArchived?: boolean
  archivedAt?: number
}

export interface SearchResult {
  query: string
  matches: SearchMatch[]
  totalMatches: number
  limitReached?: boolean
}

export interface SearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean  
  useRegex?: boolean
  includeDeleted?: boolean
}

export class SearchService {
  static searchInBuffers(
    buffers: Array<{ id?: number; label: string; value: string; archived?: boolean; archivedAt?: number; isTemporary?: boolean }>,
    query: string,
    options: SearchOptions = {},
    monaco: Monaco | null
  ): SearchResult {
    const {
      caseSensitive = false,
      wholeWord = false,
      useRegex = false,
      includeDeleted = true,
    } = options

    if (!query.trim() || query.trim().length < 3) {
      return { query, matches: [], totalMatches: 0 }
    }

    let matches: SearchMatch[] = []
    const filteredBuffers = buffers.filter(buffer => {
      if (!includeDeleted && buffer.archived) return false
      return true
    })

    const maxLength = 10000
    let limitReached = false
    for (const buffer of filteredBuffers) {
      if (typeof buffer.id !== 'number') continue
      
      const remainingCapacity = maxLength - matches.length
      if (remainingCapacity <= 0) {
        limitReached = true
        break
      }
      
      const bufferMatches = this.searchInBuffer(
        buffer as { id: number; label: string; value: string; archived?: boolean; archivedAt?: number },
        query,
        { caseSensitive, wholeWord, useRegex },
        monaco,
        remainingCapacity,
      )
      
      matches = [...matches, ...bufferMatches]
      if (matches.length >= maxLength) {
        limitReached = true
        break
      }
    }

    return {
      query,
      matches,
      totalMatches: matches.length,
      limitReached
    }
  }

  private static searchInBuffer(
    buffer: { id: number; label: string; value: string; archived?: boolean; archivedAt?: number },
    query: string,
    options: Pick<SearchOptions, 'caseSensitive' | 'wholeWord' | 'useRegex'>,
    monaco: Monaco | null,
    limit?: number,
  ): SearchMatch[] {
    const { caseSensitive, wholeWord, useRegex } = options
    if (!monaco) return []
    
    const model = monaco?.editor.createModel(buffer.value, QuestDBLanguageName)
    
    try {
      let searchString = query
      let isRegexSearch = useRegex || false
      
      if (wholeWord && !useRegex) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        searchString = `\\b${escapedQuery}\\b`
        isRegexSearch = true
      }
      
      const monacoMatches = model.findMatches(
        searchString,
        false, // searchOnlyEditableRange
        isRegexSearch,
        caseSensitive || false,
        null, // wordSeparators - null means use default word definition
        false, // captureMatches
        limit // pass the limit to Monaco
      )
      
      return monacoMatches.map(match => {
        const line = model.getLineContent(match.range.startLineNumber)
        const matchStart = match.range.startColumn - 1
        const matchEnd = match.range.endColumn - 1
        
        const previewStart = Math.max(0, matchStart - 25)
        const previewEnd = Math.min(line.length, matchEnd + 25)
        const previewText = line.substring(previewStart, previewEnd) + (line.length > previewEnd ? '...' : '')
        
        return {
          bufferId: buffer.id,
          bufferLabel: buffer.label,
          range: match.range,
          text: line.substring(matchStart, matchEnd),
          previewText,
          isArchived: buffer.archived || false,
          archivedAt: buffer.archivedAt,
        }
      })
    } finally {
      model.dispose()
    }
  }

  static groupMatchesByBuffer(matches: SearchMatch[]): Map<number, SearchMatch[]> {
    const grouped = new Map<number, SearchMatch[]>()
    
    for (const match of matches) {
      if (!grouped.has(match.bufferId)) {
        grouped.set(match.bufferId, [])
      }
      grouped.get(match.bufferId)!.push(match)
    }

    return grouped
  }

  static highlightText(text: string, query: string, options: SearchOptions = {}): string {
    const { caseSensitive = false, wholeWord = false, useRegex = false } = options

    if (!query.trim()) {
      return text
    }

    let searchRegex: RegExp
    try {
      if (useRegex) {
        searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi')
      } else {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = wholeWord ? `\\b${escapedQuery}\\b` : escapedQuery
        searchRegex = new RegExp(pattern, caseSensitive ? 'g' : 'gi')
      }
    } catch (e) {
      return text
    }

    return text.replace(searchRegex, '<mark>$&</mark>')
  }
}