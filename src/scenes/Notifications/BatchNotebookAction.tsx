import React from "react"
import { ArrowUpRightIcon } from "@phosphor-icons/react"
import { useNotebookTransfer } from "../../hooks/useNotebookTransfer"
import type { EditorBatchTransfer } from "../../utils/notebooks/notebookTransfer"
import {
  NotebookActionIcon,
  ResultToolbarAction,
} from "../Result/ResultToolbarAction"

export const BatchNotebookAction = ({
  batch,
}: {
  batch: EditorBatchTransfer
}) => {
  const { transfer, busy } = useNotebookTransfer()
  const { queries, hasAllResults, writeCount, omittedCount } = batch
  const count = queries.length
  const target = hasAllResults ? "query result" : "query"
  const pluralTarget = hasAllResults ? "query results" : "queries"
  const label =
    count === 0
      ? "Open in notebook"
      : `Open ${count} ${count === 1 ? target : pluralTarget}`
  const description = [
    writeCount > 0 ? "Write statements aren’t included." : "",
    count > 0 && !hasAllResults ? "Only the SQL will be copied." : "",
    omittedCount > 0
      ? `Only the first ${count} queries fit in the notebook.`
      : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <ResultToolbarAction
      density="full"
      label={label}
      icon={
        <NotebookActionIcon>
          <ArrowUpRightIcon size={18} />
        </NotebookActionIcon>
      }
      busy={busy}
      description={description}
      data-hook="batch-open-notebook"
      onClick={() => {
        if (busy) return
        void transfer({
          queries: count > 0 ? queries : [{ sql: "" }],
          source: "script_results",
          sourceBufferId: batch.bufferId,
          compare: count > 1,
        })
      }}
    />
  )
}
