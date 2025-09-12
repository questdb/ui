// Import pre-generated documentation data
import { functionsDocs, operatorsDocs, sqlDocs, questdbTocList } from './questdb-docs-data'
import type { DocFile } from './questdb-docs-data/functions-docs'

export type DocCategory = 'functions' | 'operators' | 'sql'

// Type the imported data
const docsData: Record<DocCategory, DocFile[]> = {
  functions: functionsDocs,
  operators: operatorsDocs,
  sql: sqlDocs
}

/**
 * Get the table of contents for all QuestDB documentation
 */
export function getQuestDBTableOfContents(): string {
  const toc = questdbTocList as Record<DocCategory, string[]>
  
  let result = '# QuestDB Documentation Table of Contents\n\n'
  
  // Functions
  result += '## Functions\n'
  result += toc.functions.join(', ') + '\n\n'
  
  // Operators
  result += '## Operators\n'
  result += toc.operators.join(', ') + '\n\n'
  
  // SQL Keywords\n'
  result += '## SQL Syntax & Keywords\n'
  result += toc.sql.join(', ') + '\n'
  
  return result
}

/**
 * Get documentation for specific items
 */
export function getSpecificDocumentation(category: DocCategory, items: string[]): string {
  const categoryDocs = docsData[category]
  if (!categoryDocs) {
    return `Unknown category: ${category}`
  }
  
  const chunks: string[] = []
  const processedPaths = new Set<string>()
  
  for (const item of items) {
    const normalizedItem = item.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    
    // Find files containing this item
    for (const file of categoryDocs) {
      // Check if file name matches
      const fileKey = file.path.split('/').pop()?.replace('.md', '').replace(/-/g, '_')
      const hasItemInPath = fileKey === normalizedItem
      
      // Check if any header matches
      const hasItemInHeaders = file.headers.some(h => 
        h.toLowerCase().replace(/[^a-z0-9_]/g, '_') === normalizedItem ||
        h.toLowerCase() === item.toLowerCase()
      )
      
      if ((hasItemInPath || hasItemInHeaders) && !processedPaths.has(file.path)) {
        processedPaths.add(file.path)
        
        // If looking for a specific function/operator, try to extract just that section
        const matchingHeader = file.headers.find(h => 
          h.toLowerCase() === item.toLowerCase() ||
          h.toLowerCase().replace(/[^a-z0-9_]/g, '_') === normalizedItem
        )
        
        if (matchingHeader) {
          const sectionContent = extractSection(file.content, matchingHeader)
          if (sectionContent) {
            chunks.push(`### ${file.path} - ${matchingHeader}\n\n${sectionContent}`)
            continue
          }
        }
        
        // Otherwise include the whole file
        chunks.push(`### ${file.path}\n\n${file.content}`)
      }
    }
  }
  
  if (chunks.length === 0) {
    return `No documentation found for: ${items.join(', ')}`
  }
  
  return chunks.join('\n\n---\n\n')
}

/**
 * Extract a specific section from markdown content
 */
function extractSection(content: string, sectionHeader: string): string | null {
  const lines = content.split('\n')
  let inSection = false
  const sectionContent: string[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Check if we found the section header
    if (line === `## ${sectionHeader}` || line === `### ${sectionHeader}`) {
      inSection = true
      sectionContent.push(line)
    } else if (inSection) {
      // Check if we reached the next section
      if (line.match(/^###?\s/)) {
        break
      }
      sectionContent.push(line)
    }
  }
  
  return sectionContent.length > 0 ? sectionContent.join('\n') : null
}

/**
 * Search for documentation by keyword
 */
export function searchDocumentation(query: string): string {
  const lowerQuery = query.toLowerCase()
  const results: string[] = []
  
  // Search in all categories
  for (const [category, docs] of Object.entries(docsData)) {
    for (const file of docs) {
      // Check file name
      if (file.path.toLowerCase().includes(lowerQuery)) {
        results.push(`${category}/${file.title}`)
      }
      
      // Check headers
      for (const header of file.headers) {
        if (header.toLowerCase().includes(lowerQuery)) {
          results.push(`${category}/${header}`)
        }
      }
    }
  }
  
  if (results.length === 0) {
    return `No results found for: ${query}`
  }
  
  return `Found ${results.length} results:\n${results.join('\n')}`
}