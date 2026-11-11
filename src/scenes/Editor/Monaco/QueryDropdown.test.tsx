// @vitest-environment jsdom
import React from "react"
import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderComponent, getHook } from "../../../test/component"
import { QueryDropdown } from "./QueryDropdown"
import type { Request } from "./utils"

const showMenu = (queries: Partial<Request>[]) => {
  const onRunQuery = vi.fn()
  const onExplainQuery = vi.fn()
  const menu = (items: Partial<Request>[]) => (
    <QueryDropdown
      open
      onOpenChange={vi.fn()}
      positionRef={{ current: null }}
      queriesRef={{ current: items as Request[] }}
      isContextMenuRef={{ current: true }}
      isAIDropdownRef={{ current: false }}
      onRunQuery={onRunQuery}
      onExplainQuery={onExplainQuery}
      onCopyQueryLink={vi.fn()}
      onAskAIRef={{ current: vi.fn() }}
    />
  )
  const view = renderComponent(menu(queries))
  return {
    onRunQuery,
    onExplainQuery,
    changeQueries: (items: Partial<Request>[]) => view.rerender(menu(items)),
  }
}

describe("query menu", () => {
  it("lists each query and runs the selected request", () => {
    // Given
    const queries = [
      { query: "select 11" },
      { query: "select 22" },
      { query: "select 33" },
    ]
    const { onRunQuery } = showMenu(queries)
    expect(getHook("dropdown-item-run-query-0")).toHaveTextContent(
      'Run "select 11"',
    )
    expect(getHook("dropdown-item-run-query-1")).toHaveTextContent(
      'Run "select 22"',
    )
    expect(getHook("dropdown-item-run-query-2")).toHaveTextContent(
      'Run "select 33"',
    )
    // When
    fireEvent.click(getHook("dropdown-item-run-query-1"))
    // Then
    expect(onRunQuery).toHaveBeenCalledTimes(1)
    expect(onRunQuery).toHaveBeenCalledWith(queries[1])
  })
  it("uses the selected SQL for run and explain labels and preserves the full request", () => {
    // Given
    const selected = "select md5(concat('1', x)) as md from long_sequence(100)"
    const query = {
      query: `create table long_seq as (\n${selected}\n);`,
      selection: { queryText: selected },
    } as Request
    const { onRunQuery, onExplainQuery, changeQueries } = showMenu([
      { query: query.query },
    ])
    expect(getHook("dropdown-item-run-query")).toHaveTextContent(
      'Run "create table long_seq as (',
    )
    expect(getHook("dropdown-item-get-query-plan")).toHaveTextContent(
      'Get query plan for "create table long_seq as (',
    )
    // When
    changeQueries([query])
    // Then
    expect(getHook("dropdown-item-run-query")).toHaveTextContent(
      "Run \"select md5(concat('1', x)) as ...\"",
    )
    expect(getHook("dropdown-item-get-query-plan")).toHaveTextContent(
      "Get query plan for \"select md5(concat('1', x)) as ...\"",
    )
    expect(getHook("dropdown-item-copy-query-link")).toHaveTextContent(
      'Copy link to "create table long_seq as (',
    )
    // When
    fireEvent.click(getHook("dropdown-item-run-query"))
    fireEvent.click(getHook("dropdown-item-get-query-plan"))
    // Then
    expect(onRunQuery).toHaveBeenCalledTimes(1)
    expect(onRunQuery).toHaveBeenCalledWith(query)
    expect(onExplainQuery).toHaveBeenCalledTimes(1)
    expect(onExplainQuery).toHaveBeenCalledWith(query)
  })
})
