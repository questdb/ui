import React, { useRef, useState, useContext, useEffect } from "react"
import styled from "styled-components"
import { Latency, RowsApplied } from "./types"
import * as QuestDB from "../../../utils/questdb"
import { rowsApplied as rowsAppliedSQL, latency as latencySQL } from "./queries"
import { QuestContext } from "../../../providers"
import { Box } from "@questdb/react-components"

const StyledTable = styled.table`
  width: 100%;
  border-spacing: 0.5rem;

  td {
    font-size: 1.2rem;
  }
`

const Name = styled.td`
  background: #24252e;
  font-weight: 600;
  padding: 0.5rem 1rem;
`

const Value = styled.td`
  background: #21212a;
  text-align: center;
  padding: 0.5rem 0;
`

export const TableStats = ({ id }: { id: string }) => {
  const { quest } = useContext(QuestContext)
  const [rowsApplied, setRowsApplied] = useState<RowsApplied[]>([])
  const [latency, setLatency] = useState<Latency[]>([])

  const rowsAppliedInterval = useRef<ReturnType<typeof setInterval>>()
  const latencyInterval = useRef<ReturnType<typeof setInterval>>()

  const fetchRowsApplied = async () => {
    const response = await quest.query<RowsApplied>(rowsAppliedSQL(id))
    if (response && response.type === QuestDB.Type.DQL) {
      setRowsApplied(response.data)
    }
  }

  const fetchLatency = async () => {
    const response = await quest.query<Latency>(latencySQL(id))
    if (response && response.type === QuestDB.Type.DQL) {
      setLatency(response.data)
    }
  }

  useEffect(() => {
    fetchRowsApplied()
    fetchLatency()

    rowsAppliedInterval.current = setInterval(() => {
      fetchRowsApplied()
    }, 10000)

    latencyInterval.current = setInterval(() => {
      fetchLatency()
    }, 10000)

    return () => {
      clearInterval(rowsAppliedInterval.current)
      clearInterval(latencyInterval.current)
    }
  }, [])

  return (
    <Box flexDirection="column" gap="1rem">
      <StyledTable>
        <tbody>
          {latency.length > 0 && (
            <tr>
              <Name>Latency</Name>
              <Value>
                {latency.length > 0 &&
                  parseFloat(latency[latency.length - 1].avg_latency).toFixed(
                    3,
                  )}
                μs
              </Value>
            </tr>
          )}
          {rowsApplied.length > 0 && (
            <tr>
              <Name>Rows written/min</Name>
              <Value>
                {rowsApplied.length > 0 &&
                  rowsApplied[rowsApplied.length - 1].numOfRowsWritten}
              </Value>
            </tr>
          )}
          {rowsApplied.length > 0 && (
            <tr>
              <Name>Write amplification</Name>
              <Value>
                {rowsApplied.length > 0 &&
                  rowsApplied[rowsApplied.length - 1].avgWalAmplification}
                x
              </Value>
            </tr>
          )}
        </tbody>
      </StyledTable>
    </Box>
  )
}
