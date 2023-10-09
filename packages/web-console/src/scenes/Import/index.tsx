import React from "react"
import styled from "styled-components"
import { Page } from "../../components"
import { ImportCSVFiles } from "./ImportCSVFiles"
import { BusEvent } from "../../consts"

const Root = styled.div`
  display: flex;
  width: 100%;
  padding: 2rem;
  margin-bottom: 4rem;
  overflow: auto;
`

const Import = () => {
  return (
    <Page>
      <Root>
        <ImportCSVFiles
          onImported={(result) => {
            if (result.status === "OK") {
              bus.trigger(BusEvent.MSG_QUERY_SCHEMA)
              bus.trigger(BusEvent.MSG_QUERY_FIND_N_EXEC, {
                query: `"${result.location}"`,
                options: { appendAt: "end" },
              })
            }
          }}
        />
      </Root>
    </Page>
  )
}

export default Import
