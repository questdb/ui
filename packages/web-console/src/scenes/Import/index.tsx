import React from "react"
import styled from "styled-components"
import { Page } from "../../components"
import { Upload2 } from "styled-icons/remix-line"
import { ImportCSVFiles } from "./ImportCSVFiles"

const Root = styled.div`
  display: flex;
  width: 100%;
  padding: 2rem;
`

const Import = () => {
  return (
    <Page title="Import" icon={<Upload2 size="20px" />}>
      <Root>
        <ImportCSVFiles onImported={() => {}} />
      </Root>
    </Page>
  )
}

export default Import