import { describe, expect, it } from "vitest"
import { escapeHtml, markControlCharacters } from "./utils"

describe("markControlCharacters", () => {
  it("replaces a right-to-left override with a visible marker", () => {
    // Given
    const html = "SELECT 1 /*\u202E*/ DROP TABLE t"

    // When
    const marked = markControlCharacters(html)

    // Then
    expect(marked).toBe(
      'SELECT 1 /*<span class="control-character">[U+202E]</span>*/ DROP TABLE t',
    )
  })

  it("marks every bidi isolate, mark, and C0 control character", () => {
    // Given
    const html = "\u2066a\u2069b\u200Ec\u061Cd\u0007e\u007F"

    // When
    const marked = markControlCharacters(html)

    // Then
    expect(marked.match(/control-character/g)).toHaveLength(6)
    expect(marked).toContain("[U+2066]")
    expect(marked).toContain("[U+0007]")
    expect(marked).toContain("[U+007F]")
  })

  it("leaves tabs, newlines, and colorized markup untouched", () => {
    // Given
    const html = '<span class="mtk5">SELECT</span>\t1<br/>\r\n'

    // When
    const marked = markControlCharacters(html)

    // Then
    expect(marked).toBe(html)
  })
})

describe("escapeHtml", () => {
  it("escapes markup so raw SQL renders as text", () => {
    // Given
    const sql = `SELECT a < b AND c > "d" & '<x>'`

    // When
    const escaped = escapeHtml(sql)

    // Then
    expect(escaped).toBe(
      "SELECT a &lt; b AND c &gt; &quot;d&quot; &amp; '&lt;x&gt;'",
    )
  })
})
