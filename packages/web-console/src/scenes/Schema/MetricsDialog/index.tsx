import React from "react"
import { Dialog, ForwardRef, Button, Overlay } from "@questdb/react-components"
import { Undo } from "@styled-icons/boxicons-regular"
import styled from "styled-components"
import * as QuestDB from "../../../utils/questdb"
import { Chart } from "@styled-icons/boxicons-regular"
import { Box } from "../../../components/Box"
import { useContext, useRef } from "react"
import { QuestContext } from "../../../providers"
import { ChartTypeConfig, GraphType, Latency } from "../Table/types"
import { MetricDuration } from "../../../modules/Graph/types"
import { useGraphOptions } from "../Table/useGraphOptions"
import UplotReact from "uplot-react"
import { FileDownload } from "@styled-icons/remix-line"
import {
  rowsApplied as rowsAppliedSQL,
  latency as latencySQL,
} from "../Table/queries"

const StyledDescription = styled(Dialog.Description)`
  position: relative;
  display: grid;
  gap: 2rem;
`

const GraphRoot = styled.div`
  width: 100%;
`

const Label = styled.div`
  position: absolute;
  bottom: 1rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-family: ${({ theme }) => theme.font};
`

const LabelValue = styled.span`
  color: ${({ theme }) => theme.color.cyan};
`

const GRAPH_WIDTH = 760

export const MetricsDialog = ({
  table_name,
  id,
  trigger,
  chartType,
  chartTypeConfig,
  metricDuration,
}: {
  table_name: string
  id: string
  trigger: React.ReactNode
  chartType: GraphType
  chartTypeConfig: ChartTypeConfig
  metricDuration: MetricDuration
}) => {
  const { quest } = useContext(QuestContext)
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const graphRootRef = useRef<HTMLDivElement>(null)

  const graphOptions = useGraphOptions({
    data: chartTypeConfig.data,
    duration: metricDuration,
    timeRef,
    valueRef,
    xValue: (rawValue, index, ticks) =>
      index === 0 || index === ticks.length - 1
        ? new Date(rawValue).toLocaleTimeString(navigator.language, {
            ...(metricDuration !== MetricDuration.TWENTY_FOUR_HOURS
              ? { day: "2-digit", month: "2-digit", year: "2-digit" }
              : {}),
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })
        : null,
    yValue: chartTypeConfig.yValue,
  })

  const downloadChartData = () => {
    quest.exportQueryToCsv(
      chartType === GraphType.Latency
        ? latencySQL(id, metricDuration)
        : rowsAppliedSQL(id, metricDuration),
    )
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <ForwardRef>{trigger}</ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <Dialog.Content
          data-hook="metrics-dialog"
          data-table-name={table_name}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation()
          }}
          maxwidth={`${(GRAPH_WIDTH + 2 * 20) / 10}rem`}
        >
          <Dialog.Title>
            <Box>
              <Chart size={20} />
              {chartTypeConfig.label} for {table_name}, {metricDuration}
            </Box>
          </Dialog.Title>

          <StyledDescription>
            <UplotReact
              options={{
                ...graphOptions,
                width: GRAPH_WIDTH,
                height: 300,
              }}
              data={chartTypeConfig.data}
            />
            <GraphRoot ref={graphRootRef} />
            <Label>
              <span ref={timeRef} />
              <LabelValue ref={valueRef} />
            </Label>
          </StyledDescription>

          <Dialog.ActionButtons>
            <Button
              skin="secondary"
              onClick={downloadChartData}
              prefixIcon={<FileDownload size="18px" />}
            >
              Download metrics data
            </Button>
            <Dialog.Close asChild>
              <Button
                prefixIcon={<Undo size={18} />}
                skin="secondary"
                data-hook="metrics-dialog-dismiss"
              >
                Dismiss
              </Button>
            </Dialog.Close>
          </Dialog.ActionButtons>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
