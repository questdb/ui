import React from "react"
import { Nav } from "../../../../modules/Import/panel"
import styled from "styled-components"
import { Input } from "../../../../components"
import { StyledIconBase } from "@styled-icons/styled-icon"
import { Search2 } from "@styled-icons/remix-line"


const StyledSearchNav = styled(Nav)`
  padding-block: 0;

  ${StyledIconBase} {
    margin-right: -3rem;
  }
`

const StyledSearchInput = styled(Input)`
  background-color: transparent;

  padding-left: 3rem;
`

export const SearchInput = (props: any) => {
  return (
    <StyledSearchNav>
      <Search2 size="18px" /> <StyledSearchInput {...props} />
    </StyledSearchNav>
  )
}
