import type { SearchOptions } from '../services/search'
import type { SearchMatch } from '../services/search'

export interface TextMatch {
  startOffset: number
  endOffset: number
  lineNumber: number
  column: number
  endLineNumber: number
  endColumn: number
  text: string
  previewText: string
  matchStartInPreview: number
  matchEndInPreview: number
}

interface LineInfo {
  lines: string[]
  lineStarts: number[]
}

class WorkerCreationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkerCreationError'
  }
}

export class SearchTimeoutError extends Error {
  partialMatches?: TextMatch[]
  partialSearchMatches?: SearchMatch[] // SearchMatch[] from search service
  
  constructor(message: string, partialMatches?: TextMatch[] | SearchMatch[]) {
    super(message)
    this.name = 'Search timeout error'
    
    if (partialMatches) {
      if (partialMatches.length > 0 && 'startOffset' in partialMatches[0]) {
        this.partialMatches = partialMatches as TextMatch[]
      } else {
        this.partialSearchMatches = partialMatches as SearchMatch[]
      }
    }
  }
}

export class SearchCancelledError extends Error {
  constructor(message: string = 'Search was cancelled') {
    super(message)
    this.name = 'SearchCancelledError'
  }
}

export function getLineInfo(text: string): LineInfo {
  const lines = text.split('\n')
  const lineStarts: number[] = [0]
  let position = 0
  
  for (let i = 0; i < lines.length - 1; i++) {
    position += lines[i].length + 1
    lineStarts.push(position)
  }
  
  return { lines, lineStarts }
}

export function getLineNumber(offset: number, lineStarts: number[]): number {
  let left = 0
  let right = lineStarts.length - 1
  
  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2)
    if (lineStarts[mid] <= offset) {
      left = mid
    } else {
      right = mid - 1
    }
  }
  
  return left + 1
}

export function getColumn(offset: number, lineNumber: number, lineStarts: number[]): number {
  return offset - lineStarts[lineNumber - 1] + 1
}

function escapeRegExpCharacters(value: string): string {
  return value.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, '\\$&');
}

export function createSearchPattern(query: string, options: SearchOptions): RegExp {
  const { caseSensitive = false, wholeWord = false, useRegex = false } = options
  let searchString = query
  
  if (!useRegex) {
    searchString = escapeRegExpCharacters(searchString)
  }
  
  if (wholeWord) { // If the first or last character is not a word boundary, don't add \b
    if (!/\B/.test(searchString.charAt(0))) {
      searchString = '\\b' + searchString
    }
    if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
      searchString = searchString + '\\b'
    }
  }
  
  return new RegExp(searchString, caseSensitive ? 'g' : 'gi')
  
}

function processMatch(
  match: RegExpExecArray,
  lines: string[],
  lineStarts: number[]
): TextMatch {
  const startOffset = match.index
  const endOffset = match.index + match[0].length
  
  const lineNumber = getLineNumber(startOffset, lineStarts)
  const endLineNumber = getLineNumber(endOffset - 1, lineStarts)
  const column = getColumn(startOffset, lineNumber, lineStarts)
  const endColumn = getColumn(endOffset - 1, endLineNumber, lineStarts) + 1
  
  const lineContent = lines[lineNumber - 1]
  
  const matchStartInLine = column - 1
  const matchEndInLine = lineNumber === endLineNumber ? endColumn - 1 : lineContent.length
  const previewStart = Math.max(0, matchStartInLine - 15)
  const previewEnd = Math.min(lineContent.length, matchEndInLine + 15)
  
  let previewText = ''
  let matchStartInPreview = matchStartInLine - previewStart
  let matchEndInPreview = matchEndInLine - previewStart
  
  if (previewStart > 0) {
    previewText += '...'
    matchStartInPreview += 3
    matchEndInPreview += 3
  }
  previewText += lineContent.substring(previewStart, previewEnd)
  if (previewEnd < lineContent.length) previewText += '...'
  
  return {
    startOffset,
    endOffset,
    lineNumber,
    column,
    endLineNumber,
    endColumn,
    text: match[0],
    previewText,
    matchStartInPreview,
    matchEndInPreview
  }
}

function executeSearch(
  text: string,
  query: string,
  options: SearchOptions,
  limit: number
): TextMatch[] {
  const pattern = createSearchPattern(query, options)
  const { lines, lineStarts } = getLineInfo(text)
  const matches: TextMatch[] = []
  
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (matches.length >= limit) break
    
    matches.push(processMatch(match, lines, lineStarts))
    if (match[0].length === 0 && match.index === pattern.lastIndex) {
      pattern.lastIndex = match.index + 1
    }
  }
  
  return matches
}

function workerMessageHandler(e: MessageEvent) {
  const { text, query, options, limit } = e.data
  
  try {
    const matches = executeSearch(text, query, options, limit)
    self.postMessage({ success: true, matches })
  } catch (e: unknown) {
    if (e instanceof Error) {
      self.postMessage({ 
        success: false, 
        error: e.message,
      })
    } else {
      self.postMessage({ 
        success: false, 
        error: 'Unknown error occurred: ' + (e as unknown as any).toString(),
      })
    }
  }
}

export interface SearchWorker {
  worker: Worker
  url: string
  searchId: string
}

let currentSearchWorker: SearchWorker | null = null

function createSearchWorker(searchId: string): SearchWorker {
  if (typeof Worker === 'undefined') {
    throw new WorkerCreationError('Worker not available in browser')
  }
  
  try {
    const workerCode = `
      ${getLineInfo.toString()}
      ${getLineNumber.toString()}
      ${getColumn.toString()}
      ${escapeRegExpCharacters.toString()}
      ${createSearchPattern.toString()}
      ${processMatch.toString()}
      ${executeSearch.toString()}
      ${workerMessageHandler.toString()}
      
      self.onmessage = ${workerMessageHandler.name}
    `
    
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)
    
    return { worker, url, searchId }
  } catch (e: unknown) {
    throw new WorkerCreationError('Worker creation failed: ' + (e as Error).message)
  }
}

export function terminateSearchWorker() {
  if (currentSearchWorker) {
    currentSearchWorker.worker.terminate()
    URL.revokeObjectURL(currentSearchWorker.url)
    currentSearchWorker = null
  }
}

function getWorker(searchId: string): SearchWorker {
  if (!currentSearchWorker || currentSearchWorker.searchId !== searchId) {
    terminateSearchWorker()
    
    currentSearchWorker = createSearchWorker(searchId)
  }
  
  return currentSearchWorker
}

async function findMatchesWithWorker(
  text: string,
  query: string,
  options: SearchOptions,
  limit: number,
  searchId: string
): Promise<TextMatch[]> {
  const searchWorker = getWorker(searchId)
  const { worker } = searchWorker
  
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    
    const cleanupHandlers = () => {
      worker.removeEventListener('message', messageHandler)
      worker.removeEventListener('error', errorHandler)
    }
    const clearTimeoutIfExists = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
    
    timeoutId = setTimeout(() => {
      cleanupHandlers()
      reject(new SearchTimeoutError(
        'Search took too long and was interrupted. Try using simpler search patterns.',
        []
      ))
    }, 10000)
    
    const messageHandler = (e: MessageEvent) => {
      if (!currentSearchWorker || currentSearchWorker.searchId !== searchId) {
        clearTimeoutIfExists()
        cleanupHandlers()
        reject(new SearchCancelledError('Result from outdated worker'))
        return
      }
      
      if (e.data.success) {
        resolve(e.data.matches)
      } else {
        reject(new Error(e.data.error))
      }
    }
    
    const errorHandler = (e: ErrorEvent) => {
      clearTimeoutIfExists()
      cleanupHandlers()
      if (currentSearchWorker?.searchId !== searchId) {
        reject(new SearchCancelledError('Result from outdated worker'))
      } else {
        reject(new Error('Worker error: ' + e.message))
      }
    }
    
    worker.addEventListener('message', messageHandler)
    worker.addEventListener('error', errorHandler)
    
    worker.postMessage({ text, query, options, limit })
  })
}

export async function findMatches(
  text: string,
  query: string,
  options: SearchOptions,
  limit: number,
  searchId: string
): Promise<TextMatch[]> {
  if (typeof Worker !== 'undefined') {
    try {
      return await findMatchesWithWorker(text, query, options, limit, searchId)
    } catch (e) {
      if (e instanceof WorkerCreationError) {
        console.warn('Worker not available, falling back to main search:', e)
      }
      throw e
    }
  }
  
  try {
    return executeSearch(text, query, options, limit)
  } catch (e) {
    console.warn("Main search failed", e)
    throw e
  }
}
