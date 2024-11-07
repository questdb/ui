import React from "react"
import { Dialog, ForwardRef, Button, Overlay } from "@questdb/react-components"
import { Undo } from "@styled-icons/boxicons-regular"
import { Form } from "../../../components/Form"
import { Box } from "../../../components/Box"
import styled from "styled-components"
import { AddChart } from "@styled-icons/material"
import { MetricType, metricTypeLabel } from "./utils"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { useEditor } from "../../../providers"
import merge from "lodash.merge"

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 2rem;
`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AddMetricDialog = ({ open, onOpenChange }: Props) => {
  const { activeBuffer, buffers, updateBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables)

  const buffer = buffers.find((b) => b.id === activeBuffer?.id)

  return (
    <Dialog.Root open={open}>
      <Dialog.Trigger asChild>
        <ForwardRef>
          <Button
            skin="secondary"
            prefixIcon={<AddChart size="18px" />}
            onClick={() => onOpenChange(true)}
          >
            Add widget
          </Button>
        </ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <Dialog.Content
          onEscapeKeyDown={() => onOpenChange(false)}
          onInteractOutside={() => onOpenChange(false)}
        >
          <Form<{ tableId: number; metricType: MetricType }>
            name="add-metric"
            defaultValues={{}}
            onSubmit={async (values) => {
              if (buffer?.id) {
                const newBuffer = merge(buffer, {
                  metricsViewState: {
                    metrics: [
                      ...(buffer.metricsViewState?.metrics ?? []),
                      {
                        tableId: values.tableId,
                        metricType: values.metricType,
                        position: buffer.metricsViewState?.metrics?.length ?? 0,
                      },
                    ],
                  },
                })
                await updateBuffer(buffer.id, newBuffer)
                onOpenChange(false)
              }
            }}
          >
            <Dialog.Title>
              <Box>
                <AddChart size={22} />
                Add widget
              </Box>
            </Dialog.Title>

            <StyledDescription>
              <Form.Item name="tableId" label="Table name">
                <Form.Select
                  name="tableId"
                  options={tables.map((t) => {
                    return {
                      label: t.table_name,
                      value: t.id,
                    }
                  })}
                />
              </Form.Item>
              <Form.Item name="metricType" label="Metric type">
                <Form.Select
                  name="metricType"
                  options={[
                    {
                      label: metricTypeLabel[MetricType.LATENCY],
                      value: MetricType.LATENCY,
                    },
                    {
                      label: metricTypeLabel[MetricType.WRITE_AMPLIFICATION],
                      value: MetricType.WRITE_AMPLIFICATION,
                    },
                    {
                      label: metricTypeLabel[MetricType.ROWS_APPLIED],
                      value: MetricType.ROWS_APPLIED,
                    },
                  ]}
                />
              </Form.Item>
            </StyledDescription>

            <Dialog.ActionButtons>
              <Dialog.Close asChild>
                <Button
                  prefixIcon={<Undo size={18} />}
                  skin="secondary"
                  onClick={() => onOpenChange(false)}
                >
                  Dismiss
                </Button>
              </Dialog.Close>

              <Dialog.Close asChild>
                <ForwardRef>
                  <Form.Submit
                    prefixIcon={<AddChart size={18} />}
                    variant="success"
                  >
                    Add
                  </Form.Submit>
                </ForwardRef>
              </Dialog.Close>
            </Dialog.ActionButtons>
          </Form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
