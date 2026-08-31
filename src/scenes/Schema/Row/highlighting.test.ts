import { describe, expect, it } from "vitest"
// @ts-expect-error - highlight-words-core (react-highlight-words internals) ships no type declarations
import { findAll } from "highlight-words-core"

type Chunk = { start: number; end: number; highlight: boolean }

// Row and TableSelector render <Highlighter searchWords={[query]} autoEscape>.
// Without autoEscape the library compiles the query into a RegExp verbatim, so
// a metachar the server allows in identifiers crashes the schema tree render.
const highlight = (query: string, name: string, autoEscape: boolean): Chunk[] =>
  (
    findAll as (options: {
      searchWords: string[]
      textToHighlight: string
      autoEscape: boolean
    }) => Chunk[]
  )({ searchWords: [query], textToHighlight: name, autoEscape })

describe("schema name highlighting", () => {
  it("should throw without autoEscape for a bracket the server allows in names", () => {
    // Given a table whose name contains "[", which isValidTableName permits
    const name = "trades[1m]"

    // When the user types "[" into the schema filter without autoEscape
    // Then the RegExp construction throws during render
    expect(() => highlight("[", name, false)).toThrow(SyntaxError)
  })

  it("should highlight the match with autoEscape", () => {
    // Given the same table and filter
    const name = "trades[1m]"

    // When the query is escaped before RegExp construction
    const chunks = highlight("[", name, true)

    // Then the bracket highlights instead of throwing
    expect(chunks.some((chunk) => chunk.highlight)).toBe(true)
  })
})
