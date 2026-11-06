import { describe, expect, it } from "vitest"
import { conf } from "./conf"

describe("SQL word boundaries used by error markers", () => {
  it.each(["-", "*", "/", "%", ">", "<", "=", "!", "&", "|", "^", "~"])(
    "keeps operator %s as an exact one-character token",
    (operator) => {
      // Given
      const sql = `select x FROM long_sequence(100 ${operator} "string");`
      const position = sql.indexOf(operator)
      // When
      const matches = [...sql.matchAll(new RegExp(conf.wordPattern!))]
      const token = matches.find(
        (match) =>
          match.index <= position && match.index + match[0].length > position,
      )
      // Then
      expect(token?.[0]).toBe(operator)
      expect(token?.index).toBe(position)
    },
  )
})
