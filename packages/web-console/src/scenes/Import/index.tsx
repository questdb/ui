import React from "react"
import { PaneContent, PaneWrapper } from "../../components"
import { ImportCSVFiles } from "./ImportCSVFiles"
import { ImportParquet } from "./ImportParquet"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

export type ImportType = "csv" | "parquet"

interface Props {
  type: ImportType
}

export const Import = ({ type }: Props) => {
  const handleViewData = (query: string) => {
    if (query) {
      eventBus.publish(EventType.MSG_QUERY_SCHEMA)
      eventBus.publish(EventType.MSG_QUERY_FIND_N_EXEC, {
        query,
        options: { appendAt: "end" },
      })
    }
  }

  const handleUpload = () => {
    eventBus.publish(EventType.MSG_QUERY_SCHEMA)
  }

  return (
    <PaneWrapper>
      <PaneContent>
        {type === "csv" ? (
          <ImportCSVFiles
            onUpload={handleUpload}
            onViewData={handleViewData}
          />
        ) : (
          <ImportParquet onViewData={handleViewData}/>
        )}
      </PaneContent>
    </PaneWrapper>
  )
}