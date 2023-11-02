import React, { useEffect, useRef, useState } from "react"
import { Nav } from "../../panel"
import styled from "styled-components"
import { Input, PopperToggle, Tooltip } from "../../../../components"
import { DropdownMenu } from "@questdb/react-components"
import { StyledIconBase } from "@styled-icons/styled-icon"
import { Search2 } from "@styled-icons/remix-line"
import { useSelector } from "react-redux"
import { selectors } from "../../../../store"
import Fuse from "fuse.js"

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

const TableNameInput = ({ value, onChange, ...props }: any) => {
  return (
    <>
      <Search2 size="18px" />{" "}
      <StyledSearchInput value={value} onChange={onChange} {...props} />
    </>
  )
}

export const TableNameMenu = () => {
  const [nameValue, setNameValue] = useState<string>("")
  const tables = useSelector(selectors.query.getTables)
  const fuse = new Fuse(tables, {
    keys: ["name"],
  })

  const [results, setResults] = useState<string[]>([])

  useEffect(() => {
    if (nameValue.length > 0) {
      const fuseResults = fuse.search(nameValue).map(({ item }) => item.name)
      setResults(fuseResults)
    } else {
      setResults(tables.map(({ name }) => name))
    }
  }, [nameValue])

  const onChange = (e: React.BaseSyntheticEvent) => {
    const { value } = e.target
    setNameValue(value)
  }

  return (
    <StyledSearchNav>
      <TableNameInput value={nameValue} onChange={onChange} />
      {results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "6px",
            minWidth: "100%",
            background: "black",
          }}
        >
          <ul>
            {results.map((name) => (
              <li>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </StyledSearchNav>
  )
}
