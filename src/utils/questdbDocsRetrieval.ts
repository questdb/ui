export type DocCategory =
  | "functions"
  | "operators"
  | "sql"
  | "concepts"
  | "schema"

export type ParsedDocItem = {
  name: string
  section?: string
}

/**
 * Parse a documentation item string into name and optional section
 * Handles formats like "Window Functions - avg()" or "Window Functions"
 */
export function parseDocItem(item: string): ParsedDocItem | null {
  if (!item || !item.trim()) {
    return null
  }

  const parts = item.split(/\s+-\s+/)
  if (parts.length >= 2) {
    return {
      name: parts[0].trim(),
      section: parts.slice(1).join(" - ").trim(),
    }
  }

  return { name: item.trim() }
}

/**
 * Parse multiple documentation item strings into an array of parsed items
 */
export function parseDocItems(
  items: string[],
): Array<{ name: string; section?: string }> {
  return items
    .map(parseDocItem)
    .filter((item): item is ParsedDocItem => item !== null)
}

// Base URL for documentation
const DOCS_BASE_URL = " https://questdb.com/docs"

// Interface for metadata (no content, includes url)
export interface DocFileMetadata {
  path: string
  title: string
  headers: string[]
  url: string
}

/**
 * Fetch JSON from URL
 */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }
  return response.json() as T
}

/**
 * Fetch markdown content from URL
 */
async function fetchMarkdown(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }
  return response.text()
}

/**
 * Get the table of contents for all QuestDB documentation
 */
export async function getQuestDBTableOfContents(): Promise<string> {
  const tocUrl = `${DOCS_BASE_URL}/web-console/toc-list.json`
  const toc = await fetchJson<Record<DocCategory, string[]>>(tocUrl)

  let result = "# QuestDB Documentation Table of Contents\n\n"

  // Functions
  result += "## Functions\n"
  result += toc.functions.join(", ") + "\n\n"

  // Operators
  result += "## Operators\n"
  result += toc.operators.join(", ") + "\n\n"

  // SQL Keywords
  result += "## SQL Syntax & Keywords\n"
  result += toc.sql.join(", ") + "\n\n"

  // Concepts
  if (toc.concepts) {
    result += "## Concepts\n"
    result += toc.concepts.join(", ") + "\n\n"
  }

  // Schema
  if (toc.schema) {
    result += "## Schema\n"
    result += toc.schema.join(", ") + "\n"
  }

  return result
}

/**
 * Get documentation for specific items
 */
export async function getSpecificDocumentation(
  category: DocCategory,
  items: string[],
): Promise<string> {
  // Fetch metadata for this category
  const metadataUrl = `${DOCS_BASE_URL}/web-console/${category}-docs.json`
  const categoryDocs = await fetchJson<DocFileMetadata[]>(metadataUrl)

  if (!categoryDocs) {
    return `Unknown category: ${category}`
  }

  const chunks: string[] = []
  const processedPaths = new Set<string>()

  for (const item of items) {
    const normalizedItem = item.toLowerCase().replace(/[^a-z0-9_]/g, "_")
    const parsed = parseDocItem(item)
    if (!parsed) continue

    const queryTitle = parsed.name
    const querySection = parsed.section
    const hasTitleAndSection = !!querySection

    // Find files containing this item
    for (const file of categoryDocs) {
      // Handle explicit "Title - Section" lookups
      if (hasTitleAndSection && queryTitle && querySection) {
        if (file.title.toLowerCase() === queryTitle.toLowerCase()) {
          const matchingHeaderFromTitleSection = file.headers.find(
            (h) =>
              h.toLowerCase() === querySection.toLowerCase() ||
              h.toLowerCase().replace(/[^a-z0-9_]/g, "_") ===
                querySection.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
          )
          if (
            matchingHeaderFromTitleSection &&
            !processedPaths.has(
              `${file.path}::${matchingHeaderFromTitleSection}`,
            )
          ) {
            processedPaths.add(
              `${file.path}::${matchingHeaderFromTitleSection}`,
            )

            // Fetch the markdown content
            const content = await fetchMarkdown(file.url)
            const sectionContent = extractSection(
              content,
              matchingHeaderFromTitleSection,
            )
            if (sectionContent) {
              chunks.push(
                `### ${file.path} - ${matchingHeaderFromTitleSection}\n\n${sectionContent}`,
              )
              continue
            }
          }
        }
      }

      // Check if file name matches
      const fileKey = file.path
        .split("/")
        .pop()
        ?.replace(".md", "")
        .replace(/-/g, "_")
      const hasItemInPath = fileKey === normalizedItem

      // Check if title matches
      const normalizedTitle = file.title
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
      const hasItemInTitle =
        normalizedTitle === normalizedItem ||
        file.title.toLowerCase() === item.toLowerCase()

      // Check if any header matches
      const hasItemInHeaders = file.headers.some(
        (h) =>
          h.toLowerCase().replace(/[^a-z0-9_]/g, "_") === normalizedItem ||
          h.toLowerCase() === item.toLowerCase(),
      )

      if (
        (hasItemInPath || hasItemInTitle || hasItemInHeaders) &&
        !processedPaths.has(file.path)
      ) {
        processedPaths.add(file.path)

        // Fetch the markdown content
        const content = await fetchMarkdown(file.url)

        // If looking for a specific function/operator, try to extract just that section
        const matchingHeader = file.headers.find(
          (h) =>
            h.toLowerCase() === item.toLowerCase() ||
            h.toLowerCase().replace(/[^a-z0-9_]/g, "_") === normalizedItem,
        )

        if (matchingHeader) {
          const sectionContent = extractSection(content, matchingHeader)
          if (sectionContent) {
            chunks.push(
              `### ${file.path} - ${matchingHeader}\n\n${sectionContent}`,
            )
            continue
          }
        }

        // Otherwise include the whole file
        chunks.push(`### ${file.path}\n\n${content}`)
      }
    }
  }

  if (chunks.length === 0) {
    return `No documentation found for: ${items.join(", ")}`
  }

  return chunks.join("\n\n---\n\n")
}

/**
 * Extract a specific section from markdown content
 */
function extractSection(content: string, sectionHeader: string): string | null {
  const lines = content.split("\n")
  let inSection = false
  const sectionContent: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if we found the section header
    if (line === `## ${sectionHeader}`) {
      inSection = true
      sectionContent.push(line)
    } else if (inSection) {
      // Check if we reached the next section
      if (line.match(/^##?\s/)) {
        break
      }
      sectionContent.push(line)
    }
  }

  return sectionContent.length > 0 ? sectionContent.join("\n") : null
}

/**
 * Search for documentation by keyword
 */
export async function searchDocumentation(query: string): Promise<string> {
  const lowerQuery = query.toLowerCase()
  const results: string[] = []

  // Search in all categories
  const categories: DocCategory[] = [
    "functions",
    "operators",
    "sql",
    "concepts",
    "schema",
  ]

  for (const category of categories) {
    const metadataUrl = `${DOCS_BASE_URL}/web-console/${category}-docs.json`
    const docs = await fetchJson<DocFileMetadata[]>(metadataUrl)

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

  return `Found ${results.length} results:\n${results.join("\n")}`
}

export async function getReferenceFull(): Promise<string> {
  const url = `${DOCS_BASE_URL}/reference-full.md`
  return fetchMarkdown(url)
}
