import React from "react"
import { PaneContent, PaneWrapper } from "../../components"
import { ImportCSVFiles } from "../Import/ImportCSVFiles"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

export const Import = () => (
  <PaneWrapper>
    <PaneContent>
      <ImportCSVFiles
        onUpload={(result) => {
          eventBus.publish(EventType.MSG_QUERY_SCHEMA)
        }}
        onViewData={(result) => {
          if (result.status === "OK") {
            eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            eventBus.publish(EventType.MSG_QUERY_FIND_N_EXEC, {
              query: `"${result.location}"`,
              options: { appendAt: "end" },
            })
          }
        }}
      />
    </PaneContent>
  </PaneWrapper>
)
