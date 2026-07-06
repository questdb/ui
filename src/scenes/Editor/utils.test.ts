import { describe, it, expect } from "vitest"
import type { MutableRefObject } from "react"
import type { editor } from "monaco-editor"
import { extractErrorByQueryKey } from "./utils"
import type { QueryKey } from "./Monaco/utils"
import type { ExecutionRefs } from "./index"

const BUFFER_ID = 1
const QUERY_KEY = "select foo@0-10" as QueryKey

const editorWithModel = () =>
  ({
    current: {
      getModel: () => ({
        getPositionAt: (offset: number) => ({
          lineNumber: 1,
          column: offset + 1,
        }),
        getWordAtPosition: () => ({ word: "foo" }),
        getValueInRange: () => "select foo",
      }),
    },
  }) as unknown as MutableRefObject<editor.IStandaloneCodeEditor | null>

const refsWith = (execution: unknown): MutableRefObject<ExecutionRefs> =>
  ({
    current: { [BUFFER_ID]: { [QUERY_KEY]: execution } },
  }) as unknown as MutableRefObject<ExecutionRefs>

describe("extractErrorByQueryKey", () => {
  it("returns the error details when an error execution is stored for the key", () => {
    // Given a stored execution that failed for the query key
    const executionRefs = refsWith({
      error: { error: "boom", position: 7 },
      queryText: "select foo",
      startOffset: 0,
      endOffset: 10,
    })

    // When the error is extracted
    const result = extractErrorByQueryKey(
      QUERY_KEY,
      BUFFER_ID,
      executionRefs,
      editorWithModel(),
    )

    // Then the error message and offending word come back
    expect(result?.errorMessage).toBe("boom")
    expect(result?.word).toBe("foo")
    expect(result?.queryText).toBe("select foo")
  })

  it("returns null when no execution is stored for the key", () => {
    // Given a query that was edited mid-run so its offsets were never anchored,
    // leaving no execution ref under its key
    const executionRefs = {
      current: { [BUFFER_ID]: {} },
    } as unknown as MutableRefObject<ExecutionRefs>

    // When the error is extracted
    const result = extractErrorByQueryKey(
      QUERY_KEY,
      BUFFER_ID,
      executionRefs,
      editorWithModel(),
    )

    // Then there is nothing to fix, so the Fix button stays hidden
    expect(result).toBeNull()
  })

  it("returns null when the stored execution succeeded", () => {
    // Given a stored execution that carries no error
    const executionRefs = refsWith({
      success: true,
      queryText: "select foo",
      startOffset: 0,
      endOffset: 10,
    })

    // When the error is extracted
    const result = extractErrorByQueryKey(
      QUERY_KEY,
      BUFFER_ID,
      executionRefs,
      editorWithModel(),
    )

    // Then there is no error to surface
    expect(result).toBeNull()
  })

  it("returns null when the execution refs are absent", () => {
    // Given no execution refs at all
    // When the error is extracted
    const result = extractErrorByQueryKey(
      QUERY_KEY,
      BUFFER_ID,
      undefined,
      editorWithModel(),
    )

    // Then it safely reports nothing to fix
    expect(result).toBeNull()
  })
})
