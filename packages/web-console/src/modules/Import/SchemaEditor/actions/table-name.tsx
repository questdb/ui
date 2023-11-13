import React, { useEffect, useState, useContext, useRef } from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../panel"
import styled from "styled-components"
import { FormInput } from "../../../../components/Form/FormInput"
import { StyledIconBase } from "@styled-icons/styled-icon"
import { Search2 } from "@styled-icons/remix-line"
import { useSelector } from "react-redux"
import { selectors } from "../../../../store"
import Fuse, { RangeTuple } from "fuse.js"
import { useFormContext, Controller } from "react-hook-form"
import { ImportContext } from "../../import-file"

const StyledSearchNav = styled(Nav).attrs({
  as: "div",
  // isContentEditable: true,
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
    ret.push(<mark>{text.substring(start, end)}</mark>)

    nextUnmatchedIndex = end
  }

  ret.push(text.substring(nextUnmatchedIndex))

  return ret
}

type Props = {}

export const TableNameMenu = ({}: Props) => {
  const { dispatch } = useContext(ImportContext)

  const tables = useSelector(selectors.query.getTables)
  const fuse = new Fuse(tables, {
    keys: ["name"],
    includeMatches: true,
  })

  const { watch, setFocus, setValue } = useFormContext()
  const inputElement = document.getElementById("table_name_input")

  // useEffect(() => {
  //   const inputElement = document.getElementById("table_name_input")
  //   toggleInputFocused(
  //     document.activeElement === inputElement
  //   )
  // }, [document.activeElement])

  const tableName = watch("table_name")

  const [results, setResults] = useState<TableMatch[]>([])

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
      setResults([])
      // setResults(tables.map(({ name }) => ({ name })))
    }
  }, [tableName])

  useEffect(() => {
    dispatch({
      flow: tables.some(({ name }) => name === tableName)
        ? "existing"
        : "new_table",
    })
  }, [tableName])

  const shouldShowResults =
    inputElement === document.activeElement && results.length > 0

  return (
    <DropdownMenu.Root open={shouldShowResults} modal={false}>
      <DropdownMenu.Trigger asChild>
        <StyledSearchNav onClick={() => setFocus("table_name")}>
          <StyledSearchInput
            name="table_name"
            id="table_name_input"
            autoComplete="off"
            placeholder="Enter table name or search"
            prefixContent={
              <Search2
                size="18px"
                style={{
                  zIndex: 1,
                  alignSelf: "center",
                  marginRight: "-1rem",
                }}
              />
            }
          />
        </StyledSearchNav>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            setFocus("table_name")
          }}
        >
          {results.map(({ name, matches }) => (
            <DropdownMenu.CheckboxItem
              key={name}
              checked={tableName === name}
              onSelect={() => {
                setValue("table_name", name)
              }}
            >
              <DropdownMenu.ItemIndicator>✔</DropdownMenu.ItemIndicator>
              {getHighlightedText(name, matches)}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
