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

  ${StyledIconBase} {
    margin-right: -3rem;
  }
` as typeof Nav

const StyledSearchInput = styled(FormInput)`
  padding-left: 3rem;
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

  const { watch, register, setFocus, setValue } = useFormContext()
  const [inputFocused, toggleInputFocused] = useState(false)

  const focusInput = () => {
    setFocus("table_name")
    toggleInputFocused(true)
  }

  const blurInput = () => {
    console.log("blurred")
    toggleInputFocused(false)
  }

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

  console.log(inputFocused)

  const shouldShowResults = inputFocused || results.length > 0

  return (
    <DropdownMenu.Root open={shouldShowResults} modal={false}>
      <DropdownMenu.Trigger asChild>
        <StyledSearchNav onClick={focusInput}>
          <Controller
            name="table_name"
            render={({ field: { onBlur, ...inputProps } }) => (
              <>
                <Search2 size="18px" style={{ zIndex: 1 }} />
                <StyledSearchInput
                  {...inputProps}
                  autoComplete={"off"}
                  onBlur={() => {
                    blurInput()
                    onBlur()
                  }}
                />
              </>
            )}
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
    // <StyledSearchNav>
    //   <TableNameInput
    //     onFocus={() => toggleFocused(true)}
    //     onBlur={(e: any) => {
    //       if ((e.relatedTarget?.className ?? "") === "result") return
    //       toggleFocused(false)
    //     }}
    //     {...inputProps}
    //   />

    //   {/* {shouldShowResults ? (
    //     <div
    //       style={{
    //         position: "absolute",
    //         top: "100%",
    //         left: "6px",
    //         right: "6px",
    //         background: "black",
    //       }}
    //     >
    //       <ul>
    //         {results.map(({ name, matches }) => (
    //           <li
    //             className="result"
    //             tabIndex={-1}
    //             onClick={(e) => {
    //               setValue("table_name", name)
    //               toggleFocused(false)
    //             }}
    //             style={{ cursor: "pointer" }}
    //           >
    //             {getHighlightedText(name, matches)}
    //           </li>
    //         ))}
    //       </ul>
    //     </div>
    //   ) : null} */}
    // </StyledSearchNav>
  )
}
