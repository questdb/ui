const fs = require('fs')
const path = require('path')

// Base paths
const DOCS_BASE_PATH = path.join(__dirname, '../../../../documentation/documentation/reference')
const OUTPUT_PATH = path.join(__dirname, '../src/utils/questdb-docs-data')

// Categories and their paths
const DOCS_CATEGORIES = {
  functions: path.join(DOCS_BASE_PATH, 'function'),
  operators: path.join(DOCS_BASE_PATH, 'operators'),
  sql: path.join(DOCS_BASE_PATH, 'sql')
}

/**
 * Strips YAML frontmatter from markdown content
 */
function stripFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/
  return content.replace(frontmatterRegex, '')
}

/**
 * Extracts headers (function/operator/keyword names) from markdown content
 */
function extractHeaders(content) {
  const headers = []
  const lines = content.split('\n')
  
  for (const line of lines) {
    // Match ## headers (main function/operator names)
    const match = line.match(/^##\s+(.+)$/)
    if (match && !match[1].includes('Overview') && !match[1].includes('Example')) {
      headers.push(match[1].trim())
    }
  }
  
  return headers
}

/**
 * Extract title from frontmatter
 */
function extractTitle(content) {
  const match = content.match(/^---\s*\n[\s\S]*?title:\s*(.+)\n[\s\S]*?\n---/)
  return match ? match[1].trim() : null
}

/**
 * Process a single markdown file
 */
function processMarkdownFile(filePath, category) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const title = extractTitle(content)
  const cleanContent = stripFrontmatter(content)
  const headers = extractHeaders(cleanContent)
  const relativePath = path.relative(DOCS_BASE_PATH, filePath)
  
  return {
    path: relativePath,
    title: title || path.basename(filePath, '.md'),
    headers: headers,
    content: cleanContent
  }
}

/**
 * Recursively process all markdown files in a directory
 */
function processDirectory(dirPath, category) {
  const results = []
  
  try {
    const items = fs.readdirSync(dirPath)
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item)
      const stat = fs.statSync(fullPath)
      
      if (stat.isDirectory()) {
        results.push(...processDirectory(fullPath, category))
      } else if (item.endsWith('.md')) {
        results.push(processMarkdownFile(fullPath, category))
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error)
  }
  
  return results
}

/**
 * Escape string for TypeScript
 */
function escapeForTS(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')
}

/**
 * Main build function
 */
function buildDocs() {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_PATH)) {
    fs.mkdirSync(OUTPUT_PATH, { recursive: true })
  }
  
  const tocList = {}
  
  // Process each category
  Object.entries(DOCS_CATEGORIES).forEach(([category, categoryPath]) => {
    console.log(`Building ${category} documentation...`)
    
    if (!fs.existsSync(categoryPath)) {
      console.error(`Documentation directory not found: ${categoryPath}`)
      return
    }
    
    const files = processDirectory(categoryPath, category)
    
    // Extract unique items for TOC
    const items = new Set()
    files.forEach(file => {
      // Add document title for top-level entries (readable, no underscores)
      items.add(file.title)
      
      // Add headers (prefixed with document title for context)
      file.headers.forEach(header => {
        items.add(`${file.title} - ${header}`)
      })
    })
    
    tocList[category] = Array.from(items).sort()
    
    // Generate TypeScript file for this category
    const tsContent = `// Auto-generated documentation data for ${category}
// Generated on ${new Date().toISOString()}

export interface DocFile {
  path: string
  title: string
  headers: string[]
  content: string
}

export const ${category}Docs: DocFile[] = [
${files.map(file => `  {
    path: ${JSON.stringify(file.path)},
    title: ${JSON.stringify(file.title)},
    headers: [${file.headers.map(h => JSON.stringify(h)).join(', ')}],
    content: \`${escapeForTS(file.content)}\`
  }`).join(',\n')}
]
`
    
    const outputFile = path.join(OUTPUT_PATH, `${category}-docs.ts`)
    fs.writeFileSync(outputFile, tsContent, 'utf-8')
    console.log(`✓ Created ${outputFile}`)
  })
  
  // Generate TOC list file
  const tocContent = `// Auto-generated table of contents
// Generated on ${new Date().toISOString()}

export const questdbTocList = ${JSON.stringify(tocList, null, 2)}
`
  
  const tocFile = path.join(OUTPUT_PATH, 'toc-list.ts')
  fs.writeFileSync(tocFile, tocContent, 'utf-8')
  console.log(`✓ Created ${tocFile}`)
  
  // Generate index file
  const indexContent = `// Auto-generated index file
export { functionsDocs } from './functions-docs'
export { operatorsDocs } from './operators-docs'
export { sqlDocs } from './sql-docs'
export { questdbTocList } from './toc-list'
`
  
  const indexFile = path.join(OUTPUT_PATH, 'index.ts')
  fs.writeFileSync(indexFile, indexContent, 'utf-8')
  console.log(`✓ Created ${indexFile}`)
  
  console.log('\nDocumentation build complete!')
}

// Run the build
buildDocs()