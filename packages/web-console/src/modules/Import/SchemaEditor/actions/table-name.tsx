import React, { useEffect, useState, useContext, useRef } from "react"
import { Nav } from "../../panel"
import styled from "styled-components"
import { FormInput } from "../../../../components/Form/FormInput"
import { Search2 } from "@styled-icons/remix-line"
import { useSelector } from "react-redux"
import { selectors } from "../../../../store"
import Fuse, { RangeTuple } from "fuse.js"
import { useFormContext } from "react-hook-form"
import { ImportContext } from "../../import-file"

const StyledSearchNav = styled(Nav).attrs({
  as: "div",
})`
  position: relative;
` as typeof Nav

const StyledSearchInput = styled(FormInput)`
  padding-left: 3rem;
  margin-left: -1rem;
`
type TableMatch = {
  name: string
  matches?: readonly RangeTuple[]
}

const getHighlightedText = (
  text: string,
  indices: readonly RangeTuple[] = [],
) => {
  const ret: React.ReactNode[] = []
  let nextUnmatchedIndex = 0

  for (const region of indices) {
    const start = region[0],
      end = region[1] + 1
    ret.push(text.substring(nextUnmatchedIndex, start))
    ret.push(
      <mark key={`${text}-${start}-${end}`}>{text.substring(start, end)}</mark>,
    )

    nextUnmatchedIndex = end
  }

  ret.push(text.substring(nextUnmatchedIndex))

  return ret
}

type Props = {}

export const TableNameMenu = ({}: Props) => {
  const { dispatch } = useContext(ImportContext)
  const { watch, setValue } = useFormContext()
  const tables = useSelector(selectors.query.getTables)

  const tableName = watch("table_name")

  const fuse = new Fuse(tables, {
    keys: ["name"],
    includeMatches: true,
  })

  const [results, setResults] = useState<TableMatch[]>([])
  const resultsRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (tableName.length > 0) {
      const fuseResults = fuse
        .search(tableName)
        .map(({ item: { name }, matches }) => ({
          name,
          matches: matches?.[0].indices,
        }))
      setResults(fuseResults)
    } else {
      setResults(tables.map(({ name }) => ({ name })))
    }
  }, [tableName])

  useEffect(() => {
    dispatch({
      flow: tables.some(({ name }) => name === tableName)
        ? "existing"
        : "new_table",
    })
  }, [tableName])

  const [isInputFocused, setInputFocused] = useState(false)

  const shouldShowResults = isInputFocused && results.length > 0

  return (
    <>
      <StyledSearchNav>
        <StyledSearchInput
          key={"table_name"}
          name="table_name"
          id="table_name_input"
          autoComplete="off"
          placeholder="Enter table name or search"
          prefixContent={<Search2 size="18px" />}
          onFocus={(e) => {
            setInputFocused(true)
          }}
          onBlur={(e) => {
            setInputFocused(false)
          }}
        />
        {results && (
          <div
            style={{
              background: "black",
              position: "absolute",
              top: "100%",
              width: "100%",
            }}
          >
            <ul style={{ padding: "unset", width: "100%" }} ref={resultsRef}>
              {results.map(({ name, matches }) => (
                <button
                  type="button"
                  key={name}
                  onClick={(e) => {
                    setValue("table_name", name)
                    setInputFocused(true)
                  }}
                  style={{ display: "block", width: "100%" }}
                >
                  {tableName === name && <span>✔ </span>}
                  {getHighlightedText(name, matches)}
                </button>
              ))}
            </ul>
          </div>
        )}
      </StyledSearchNav>
    </>
  )
}
