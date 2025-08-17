import type { IRange } from 'monaco-editor'
import type { Buffer } from '../store/buffers'
import { findMatches, SearchTimeoutError, SearchCancelledError } from '../utils/textSearch'

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
  isStale?: boolean
}

export interface SearchResult {
  query: string
  matches: SearchMatch[]
  limitReached?: boolean
}

export interface SearchProgress {
  bufferLabel: string
  currentMatches: SearchMatch[]
  isComplete: boolean
  error?: Error
  bufferId?: number
  searchDuration?: number
}

export interface SearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean  
  useRegex?: boolean
  includeDeleted?: boolean
}

export class SearchService {
  static async searchInSingleBuffer(
    buffer: Buffer,
    query: string,
    options: SearchOptions = {},
    signal: AbortSignal,
    searchId: string,
    maxMatches: number = 10000
  ): Promise<SearchMatch[]> {
    const {
      caseSensitive = false,
      wholeWord = false,
      useRegex = false,
    } = options

    if (typeof buffer.id !== 'number') return []
    
    const matches: SearchMatch[] = []
    
    try {
      if (signal?.aborted) {
        throw new SearchCancelledError()
      }
      
      const titleMatches = await this.findTitleMatches(
        buffer.label,
        query,
        { caseSensitive, wholeWord, useRegex },
        searchId
      )
      
      if (signal?.aborted) {
        throw new SearchCancelledError()
      }
      
      for (const titleMatch of titleMatches) {
        if (matches.length >= maxMatches) break
        matches.push(this.createTitleMatch(buffer, titleMatch.start, titleMatch.end))
      }
      
      if (matches.length < maxMatches && buffer.value) {
        const remainingCapacity = maxMatches - matches.length
        const contentMatches = await this.searchInBuffer(
          buffer,
          query,
          { caseSensitive, wholeWord, useRegex },
          remainingCapacity,
          searchId
        )
        
        if (signal?.aborted) {
          throw new SearchCancelledError()
        }
        
        matches.push(...contentMatches)
      }
      
      return matches
      
    } catch (e) {
      if (e instanceof SearchCancelledError) {
        throw e
      }
      
      if (e instanceof SearchTimeoutError) {
        if (e.partialSearchMatches) {
          matches.push(...e.partialSearchMatches)
        }
        e.partialSearchMatches = matches
      }
      
      throw e
    }
  }

  static async *searchInBuffers(
    buffers: Buffer[],
    query: string,
    options: SearchOptions = {},
    signal: AbortSignal,
    searchId: string
  ): AsyncGenerator<SearchProgress, SearchResult, unknown> {
    const {
      caseSensitive = false,
      wholeWord = false,
      useRegex = false,
      includeDeleted = true,
    } = options

    const sortedBuffers = this.sortBuffersByPriority(buffers, includeDeleted)
    
    let allMatches: SearchMatch[] = []
    const maxLength = 10000
    const totalTimeout = 30000
    let limitReached = false
    let hasTimeoutError = false
    const timeoutBuffers: string[] = []
    
    const startTime = Date.now()
    
    for (const buffer of sortedBuffers) {
      if (signal?.aborted) {
        throw new SearchCancelledError()
      }
      
      if (Date.now() - startTime > totalTimeout) {
        hasTimeoutError = true
        break
      }
      
      if (typeof buffer.id !== 'number') continue
      
      const remainingCapacity = maxLength - allMatches.length
      if (remainingCapacity <= 0) {
        limitReached = true
        break
      }
      
      try {
        const searchStartTime = Date.now()
        const bufferMatches = await this.searchInSingleBuffer(
          buffer,
          query,
          { caseSensitive, wholeWord, useRegex },
          signal,
          searchId,
          remainingCapacity
        )
        const searchDuration = Date.now() - searchStartTime
        
        if (bufferMatches.length > 0) {
          allMatches = [...allMatches, ...bufferMatches]
          
          yield {
            bufferLabel: buffer.label,
            currentMatches: bufferMatches,
            isComplete: false,
            bufferId: buffer.id,
            searchDuration
          }
        } else {
          yield {
            bufferLabel: buffer.label,
            currentMatches: [],
            isComplete: false,
            bufferId: buffer.id,
            searchDuration
          }
        }
        
        if (allMatches.length >= maxLength) {
          limitReached = true
          break
        }
      } catch (e) {
        if (e instanceof SearchCancelledError) {
          throw e
        }
        
        if (e instanceof SearchTimeoutError) {
          hasTimeoutError = true
          timeoutBuffers.push(buffer.label)
          
          // searchInSingleBuffer already put all partial matches in the error
          const partialMatches = e.partialSearchMatches || []
          
          if (partialMatches.length > 0) {
            allMatches = [...allMatches, ...partialMatches]
            
            yield {
              bufferLabel: buffer.label,
              currentMatches: partialMatches,
              isComplete: false,
              error: e
            }
          }
        } else {
          yield {
            bufferLabel: buffer.label,
            currentMatches: [],
            isComplete: false,
            error: e as Error
          }
          throw e
        }
      }
    }
    
    const finalResult: SearchResult = {
      query,
      matches: allMatches,
      limitReached
    }
    
    if (hasTimeoutError) {
      const bufferText = timeoutBuffers.length === 1 
        ? `1 tab (${timeoutBuffers[0]})` 
        : `${timeoutBuffers.length} tabs`;
      throw new SearchTimeoutError(
        `Search timed out after processing ${bufferText}.${allMatches.length > 0 ? " Showing partial results." : ""}`,
        allMatches
      )
    }
    
    return finalResult
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

  private static async searchInBuffer(
    buffer: Buffer,
    query: string,
    options: Pick<SearchOptions, 'caseSensitive' | 'wholeWord' | 'useRegex'>,
    limit: number,
    searchId: string
  ): Promise<SearchMatch[]> {
    if (!buffer.value) return []
    
    try {
      const textMatches = await findMatches(buffer.value, query, options, limit, searchId)
      
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
    } catch (e) {
      if (e instanceof SearchTimeoutError) {
        // Convert partial TextMatch[] to SearchMatch[]
        const partialSearchMatches = e.partialMatches?.map(match => ({
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
        })) || []
        
        throw new SearchTimeoutError(e.message, partialSearchMatches)
      }
      throw e
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

  private static async findTitleMatches(
    bufferLabel: string,
    query: string,
    options: Pick<SearchOptions, 'caseSensitive' | 'wholeWord' | 'useRegex'>,
    searchId: string
  ): Promise<Array<{ start: number; end: number }>> {
    const pattern = await findMatches(bufferLabel, query, options, 1, searchId)
    return pattern.map(match => ({
      start: match.startOffset,
      end: match.endOffset
    }))
  }
}