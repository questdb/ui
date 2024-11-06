import React from "react"
import { Dialog, ForwardRef, Button, Overlay } from "@questdb/react-components"
import { Edit } from "@styled-icons/remix-line"
import { Undo } from "@styled-icons/boxicons-regular"
import { Text } from "../../../components/Text"
import { Form } from "../../../components/Form"
import { Box } from "../../../components/Box"
import Joi from "joi"
import { isValidTableName } from "../../../components/TableSchemaDialog/isValidTableName"
import styled from "styled-components"
import { shortenText } from "../../../utils"
import { AddChart } from "@styled-icons/material"
import { MetricType } from "./utils"
import { useSelector } from "react-redux"
import { selectors, actions } from "../../../store"
import { useEditor } from "../../../providers"

const List = styled.ul`
  list-style-position: inside;
  padding-left: 0;

  li {
    margin-bottom: 1rem;
  }
`

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 2rem;
`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AddMetricDialog = ({ open, onOpenChange }: Props) => {
  const { activeBuffer, updateBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables)

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
              if (activeBuffer?.id) {
                await updateBuffer(activeBuffer.id, {
                  metricsViewState: {
                    ...activeBuffer.metricsViewState,
                    metrics: [
                      ...(activeBuffer.metricsViewState?.metrics ?? []),
                      {
                        tableId: values.tableId,
                        metricType: values.metricType,
                        position:
                          activeBuffer.metricsViewState?.metrics?.length ?? 0,
                      },
                    ],
                  },
                })
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
                    { label: "Read latency in ms", value: MetricType.LATENCY },
                    {
                      label: "Write amplification",
                      value: MetricType.WRITE_AMPLIFICATION,
                    },
                    {
                      label: "Write throughput",
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
