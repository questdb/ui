import type { SearchOptions } from '../services/search'

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

export function findMatches(
  text: string,
  query: string,
  options: SearchOptions,
  limit?: number
): TextMatch[] {
  try {
    const pattern = createSearchPattern(query, options)

    const { lines, lineStarts } = getLineInfo(text)
    const matches: TextMatch[] = []
    
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      if (limit && matches.length >= limit) break
      
      const startOffset = match.index
      const endOffset = match.index + match[0].length
      
      const lineNumber = getLineNumber(startOffset, lineStarts)
      const endLineNumber = getLineNumber(endOffset - 1, lineStarts)
      const column = getColumn(startOffset, lineNumber, lineStarts)
      const endColumn = getColumn(endOffset - 1, endLineNumber, lineStarts) + 1
      
      const lineContent = lines[lineNumber - 1]
      
      const matchStartInLine = column - 1
      const matchEndInLine = lineNumber === endLineNumber ? endColumn - 1 : lineContent.length
      const previewStart = Math.max(0, matchStartInLine - 25)
      const previewEnd = Math.min(lineContent.length, matchEndInLine + 25)
      
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
      
      matches.push({
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
      })
    }
    
    return matches
  } catch (e: unknown) { // Regex is invalid
    if (e instanceof Error && options.useRegex) {
      throw new SyntaxError(e.message)
    }
    
    throw new Error("Something went wrong while searching for " + query)
  }
}
