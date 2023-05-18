import React from "react"
import styled from "styled-components"
import { Page } from "../../components"
import { Upload2 } from "styled-icons/remix-line"
import { ImportCSVFiles } from "./ImportCSVFiles"
import { BusEvent } from "../../consts"
import { Box } from "../../components/Box"

const Root = styled(Box).attrs({ gap: "0" })`
  width: calc(100vw - 4rem);
  padding: 2rem;
  margin-bottom: 4rem;
  overflow: hidden;
`

const Import = () => {
  return (
    <Page title="Import" icon={<Upload2 size="20px" />}>
      <Root>
        <ImportCSVFiles
          onImported={(result) => {
            if (result.status === "OK") {
              bus.trigger(BusEvent.MSG_QUERY_SCHEMA)
              bus.trigger(
                BusEvent.MSG_QUERY_FIND_N_EXEC,
                `"${result.location}"`,
              )
            }
          }}
        />
      </Root>
    </Page>
  )
}

export default Import
