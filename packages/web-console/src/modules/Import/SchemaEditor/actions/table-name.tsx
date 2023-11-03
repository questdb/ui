import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react"
import { Nav } from "../../panel"
import styled from "styled-components"
import { Input, PopperToggle, Tooltip } from "../../../../components"
import { DropdownMenu } from "@questdb/react-components"
import { StyledIconBase } from "@styled-icons/styled-icon"
import { Search2 } from "@styled-icons/remix-line"
import { useSelector } from "react-redux"
import { selectors } from "../../../../store"
import Fuse, { RangeTuple } from "fuse.js"
import { useFormContext } from "react-hook-form"

const StyledSearchNav = styled(Nav)`
  padding-block: 0;
  position: relative;

  ${StyledIconBase} {
    margin-right: -3rem;
  }
`

const StyledSearchInput = styled(Input)`
  background-color: transparent;

  padding-left: 3rem;
`

const TableNameInput = forwardRef(({ ...props }: any, ref) => {
  return (
    <>
      <Search2 size="18px" />{" "}
      <StyledSearchInput
        name="table_name"
        placeholder={"Enter or search table"}
        ref={ref}
        {...props}
      />
    </>
  )
})

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
  const tables = useSelector(selectors.query.getTables)
  const fuse = new Fuse(tables, {
    keys: ["name"],
    includeMatches: true,
  })

  const { watch, register, setValue } = useFormContext()

  const { onBlur: _onBlur, ...inputProps } = register("table_name")
  const tableName = watch("table_name")

  const [results, setResults] = useState<TableMatch[]>([])
  const [isFocused, toggleFocused] = useState(false)
  const [showResults, toggleResults] = useState(false)

  const {
    formState: { isDirty },
  } = useFormContext()

  useEffect(() => {
    console.log(tableName)
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

  const shouldShowResults = isFocused && results.length > 0

  return (
    <StyledSearchNav>
      <TableNameInput
        onFocus={() => toggleFocused(true)}
        onBlur={(e: any) => {
          if ((e.relatedTarget?.className ?? "") === "result") return
          toggleFocused(false)
        }}
        {...inputProps}
      />
      {shouldShowResults ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "6px",
            right: "6px",
            background: "black",
          }}
        >
          <ul>
            {results.map(({ name, matches }) => (
              <li
                className="result"
                tabIndex={-1}
                onClick={(e) => {
                  setValue("table_name", name)
                  toggleFocused(false)
                }}
                style={{ cursor: "pointer" }}
              >
                {getHighlightedText(name, matches)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </StyledSearchNav>
  )
}
