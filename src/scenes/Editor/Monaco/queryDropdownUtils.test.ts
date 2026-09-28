import {
  extractFullQueryText,
  extractQueryTextToRun,
} from "./queryDropdownUtils"

describe("query dropdown labels", () => {
  it("handles the initial state before a query is available", () => {
    expect(extractQueryTextToRun(undefined)).toBe("query")
    expect(extractFullQueryText(undefined)).toBe("query")
  })

  it("uses the selection for run labels and the whole query for link labels", () => {
    const query = {
      query: "SELECT first, second FROM long_table_name",
      row: 0,
      column: 1,
      endRow: 0,
      endColumn: 42,
      selection: {
        startOffset: 7,
        endOffset: 12,
        queryText: "first",
      },
    }

    expect(extractQueryTextToRun(query)).toBe('"first"')
    expect(extractFullQueryText(query)).toBe(
      '"SELECT first, second FROM long..."',
    )
  })
})
