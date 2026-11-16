import React from "react"
import styled from "styled-components"
import { useSelector } from "react-redux"
import { Button } from "../../components"
import { selectors } from "../../store"
import { useEditor } from "../../providers/EditorProvider"
import { useNotebookTransfer } from "../../hooks/useNotebookTransfer"

const Row = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1.2rem;
  padding: 0.6rem 1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
  flex-shrink: 0;
`

export const BatchNotebookAction = () => {
  const batch = useSelector(selectors.query.getBatchTransfer)
  const { activeBuffer } = useEditor()
  const { transfer, busy } = useNotebookTransfer()
  if (!batch || batch.bufferId !== activeBuffer.id) return null
  return (
    <Row data-hook="batch-notebook-action">
      <span>{batch.queries.length} query results from this script.</span>
      {batch.writeCount > 0 && <span>Write statements aren’t included.</span>}
      {!batch.hasAllResults && (
        <span>
          Results are too large to carry over. Only queries will be copied; run
          the cells to load their data.
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        data-hook="batch-open-notebook"
        onClick={() =>
          void transfer({
            queries: batch.queries,
            source: "script_results",
            sourceBuffer: activeBuffer,
            compare: true,
          })
        }
      >
        {batch.hasAllResults
          ? `Open ${batch.queries.length} results in a notebook`
          : `Create notebook from ${batch.queries.length} queries`}
      </Button>
    </Row>
  )
}
