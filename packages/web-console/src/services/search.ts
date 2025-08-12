import type { IRange } from 'monaco-editor'
import type { Buffer } from '../store/buffers'
import { findMatches, highlightMatches } from '../utils/textSearch'

export interface SearchMatch {
  bufferId: number
  bufferLabel: string
  range: IRange
  text: string
  previewText: string
  matchStartInPreview: number
  matchEndInPreview: number
  isArchived?: boolean
  archivedAt?: number
  isTitleMatch?: boolean
  isMetricsMatch?: boolean
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
    buffers: Buffer[],
    query: string,
    options: SearchOptions = {}
  ): SearchResult {
    const {
      caseSensitive = false,
      wholeWord = false,
      useRegex = false,
      includeDeleted = true,
    } = options

    if (!query.trim()) {
      return { query, matches: [], totalMatches: 0 }
    }

    const sortedBuffers = this.sortBuffersByPriority(buffers, includeDeleted)

    let matches: SearchMatch[] = []
    const maxLength = 10000
    let limitReached = false
    
    for (const buffer of sortedBuffers) {
      if (typeof buffer.id !== 'number') continue
      
      const remainingCapacity = maxLength - matches.length
      if (remainingCapacity <= 0) {
        limitReached = true
        break
      }
      
      const titleMatches = this.findTitleMatches(
        buffer.label,
        query,
        { caseSensitive, wholeWord, useRegex }
      )
      
      const contentMatches = buffer.value 
        ? this.searchInBuffer(
            buffer,
            query,
            { caseSensitive, wholeWord, useRegex },
            remainingCapacity - titleMatches.length,
          )
        : []
      
      for (const titleMatch of titleMatches) {
        if (matches.length >= maxLength) {
          limitReached = true
          break
        }
        matches.push(this.createTitleMatch(buffer, titleMatch.start, titleMatch.end))
      }
      
      matches = [...matches, ...contentMatches]
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

  private static sortBuffersByPriority(
    buffers: Buffer[],
    includeDeleted: boolean = true
  ): Buffer[] {
    const unarchived = buffers.filter(b => !b.archived).sort((a, b) => {
      if (a.position !== undefined && b.position !== undefined) {
        return a.position - b.position
      }
      return 0
    })
    
    const archived = includeDeleted 
      ? buffers.filter(b => b.archived).sort((a, b) => {
          if (a.archivedAt && b.archivedAt) {
            return b.archivedAt - a.archivedAt
          }
          return 0
        })
      : []
    
    return [
      ...unarchived,
      ...archived
    ]
  }

  private static searchInBuffer(
    buffer: Buffer,
    query: string,
    options: Pick<SearchOptions, 'caseSensitive' | 'wholeWord' | 'useRegex'>,
    limit?: number,
  ): SearchMatch[] {
    if (!buffer.value) return []
    
    const textMatches = findMatches(buffer.value, query, options, limit)
    
    return textMatches.map(match => ({
      bufferId: buffer.id!,
      bufferLabel: buffer.label,
      range: {
        startLineNumber: match.lineNumber,
        startColumn: match.column,
        endLineNumber: match.endLineNumber,
        endColumn: match.endColumn
      },
      text: match.text,
      previewText: match.previewText,
      matchStartInPreview: match.matchStartInPreview,
      matchEndInPreview: match.matchEndInPreview,
      isArchived: buffer.archived || false,
      archivedAt: buffer.archivedAt,
      isMetricsMatch: !!buffer.metricsViewState,
    }))
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
    return highlightMatches(text, query, options)
  }

  private static createTitleMatch(
    buffer: Buffer,
    matchStart: number,
    matchEnd: number
  ): SearchMatch {
    return {
      bufferId: buffer.id!,
      bufferLabel: buffer.label,
      range: {
        startLineNumber: 1,
        startColumn: matchStart + 1,
        endLineNumber: 1,
        endColumn: matchEnd + 1
      },
      text: buffer.label.substring(matchStart, matchEnd),
      previewText: buffer.label,
      matchStartInPreview: matchStart,
      matchEndInPreview: matchEnd,
      isArchived: buffer.archived || false,
      archivedAt: buffer.archivedAt,
      isTitleMatch: true,
      isMetricsMatch: !!buffer.metricsViewState,
    }
  }

  private static findTitleMatches(
    bufferLabel: string,
    query: string,
    options: Pick<SearchOptions, 'caseSensitive' | 'wholeWord' | 'useRegex'>
  ): Array<{ start: number; end: number }> {
    const pattern = findMatches(bufferLabel, query, options)
    return pattern.map(match => ({
      start: match.startOffset,
      end: match.endOffset
    }))
  }
}