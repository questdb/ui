import React from "react"
import styled from "styled-components"
import { ColumnDefinition } from "utils"
import type { ChartConfig } from "./types"
import { Form } from "../../../components/Form"
import { BarChartBox } from "styled-icons/remix-line"

type Props = {
  columns: ColumnDefinition[]
  chartConfig: ChartConfig
  onChartConfigChange: (chartConfig: ChartConfig) => void
}

const Inputs = styled.div`
  display: grid;
  gap: 2rem;
  justify-items: flex-start;
`

export const GraphSettings = ({
  columns,
  chartConfig,
  onChartConfigChange,
}: Props) => {
  return (
    <Form<ChartConfig>
      name="graph-settings"
      defaultValues={{
        ...chartConfig,
        label: columns.filter((item) => item.type === "TIMESTAMP")[0]?.name,
      }}
      onSubmit={onChartConfigChange}
    >
      <Inputs>
        <Form.Item name="type" label="Chart type">
          <Form.Select
            name="type"
            options={["line", "area", "bar"].map((item) => ({
              label: item,
              value: item,
            }))}
          />
        </Form.Item>
        <Form.Item name="label" label="Label (X-axis)">
          <Form.Select
            name="label"
            options={columns.map((item) => ({
              label: item.name,
              value: item.name,
            }))}
          />
        </Form.Item>
        <Form.Item name="series" label="Series">
          <Form.MultiSelect
            name="series"
            options={columns.map((item) => ({
              label: item.name,
              value: item.name,
            }))}
            labelledBy="Select"
          />
        </Form.Item>
        <Form.Submit prefixIcon={<BarChartBox size="18px" />} variant="success">
          Draw
        </Form.Submit>
      </Inputs>
    </Form>
  )
}
