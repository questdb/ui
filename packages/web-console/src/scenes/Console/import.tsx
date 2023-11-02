import React from "react"
import { PaneContent, PaneWrapper } from "../../components"
import { ImportCSVFiles } from "../Import/ImportCSVFiles"
import { BusEvent } from "../../consts"

export const Import = () => (
  <PaneWrapper>
    <PaneContent>
      <ImportCSVFiles
        onViewData={(result) => {
          if (result.status === "OK") {
            bus.trigger(BusEvent.MSG_QUERY_SCHEMA)
            bus.trigger(BusEvent.MSG_QUERY_FIND_N_EXEC, {
              query: `"${result.location}"`,
              options: { appendAt: "end" },
            })
          }
        }}
      />
    </PaneContent>
  </PaneWrapper>
)
