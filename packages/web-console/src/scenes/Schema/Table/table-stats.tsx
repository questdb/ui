import React, { useRef, useState, useContext, useEffect } from "react"
import styled from "styled-components"
import { Latency, RowsApplied } from "./types"
import * as QuestDB from "../../../utils/questdb"
import { rowsApplied as rowsAppliedSQL, latency as latencySQL } from "./queries"
import { QuestContext } from "../../../providers"
import { Box } from "@questdb/react-components"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { Text } from "../../../components/Text"
import { Information } from "@styled-icons/remix-line"

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

const ValueText = ({
  text,
  tooltipText,
}: {
  text: React.ReactNode
  tooltipText: string
}) => (
  <IconWithTooltip
    icon={
      <Box gap="0.5rem" align="center" justifyContent="center">
        <Information size="14px" />
        <Text color="foreground">{text}</Text>
      </Box>
    }
    tooltip={tooltipText}
    placement="bottom"
  />
)

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
                <ValueText
                  text={
                    latency.length > 0 &&
                    parseFloat(latency[latency.length - 1].avg_latency).toFixed(
                      3,
                    ) + "μs"
                  }
                  tooltipText={latency[latency.length - 1].time}
                />
              </Value>
            </tr>
          )}
          {rowsApplied.length > 0 && (
            <tr>
              <Name>Rows written/min</Name>
              <Value>
                <ValueText
                  text={rowsApplied[rowsApplied.length - 1].numOfRowsWritten}
                  tooltipText={rowsApplied[rowsApplied.length - 1].time}
                />
              </Value>
            </tr>
          )}
          {rowsApplied.length > 0 && (
            <tr>
              <Name>Write amplification</Name>
              <Value>
                <ValueText
                  text={
                    rowsApplied[rowsApplied.length - 1].avgWalAmplification +
                    "x"
                  }
                  tooltipText={rowsApplied[rowsApplied.length - 1].time}
                />
              </Value>
            </tr>
          )}
        </tbody>
      </StyledTable>
    </Box>
  )
}
