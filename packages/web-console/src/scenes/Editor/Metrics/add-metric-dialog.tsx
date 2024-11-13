import React from "react"
import {
  Dialog,
  ForwardRef,
  Box,
  Button,
  Overlay,
} from "@questdb/react-components"
import { Undo } from "@styled-icons/boxicons-regular"
import { Text } from "../../../components/Text"
import styled from "styled-components"
import { AddChart } from "@styled-icons/material"
import { MetricType, metricTypeLabel } from "./utils"
import { useEditor } from "../../../providers"
import merge from "lodash.merge"

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 2rem;
`

const Metrics = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, 1fr);
`

const Metric = styled(Box).attrs({ flexDirection: "column", gap: "1rem" })`
  background: ${({ theme }) => theme.color.selectionDarker};
  border-radius: 0.4rem;
  cursor: pointer;
  border: 1px solid transparent;
  padding-bottom: 1rem;
  transition: background 0.1s ease-in;

  &:hover {
    background: ${({ theme }) => theme.color.selection};
  }
`

const Image = styled(Box).attrs({ align: "center", justifyContent: "center" })`
  width: 100%;
  height: 10rem;
  background: linear-gradient(
    309deg,
    rgba(30, 31, 37, 1) 0%,
    rgba(36, 37, 47, 1) 100%
  );
  border-top-left-radius: 0.4rem;
  border-top-right-radius: 0.4rem;
`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AddMetricDialog = ({ open, onOpenChange }: Props) => {
  const { activeBuffer, buffers, updateBuffer } = useEditor()

  const buffer = buffers.find((b) => b.id === activeBuffer?.id)

  const handleSelectMetric = async (metricType: MetricType) => {
    if (buffer?.id) {
      const newBuffer = merge(buffer, {
        metricsViewState: {
          metrics: [
            ...(buffer.metricsViewState?.metrics ?? []),
            {
              metricType,
              position: buffer.metricsViewState?.metrics?.length ?? 0,
            },
          ],
        },
      })
      await updateBuffer(buffer.id, newBuffer)
      onOpenChange(false)
    }
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Trigger asChild>
        <ForwardRef>
          <Button
            skin="secondary"
            prefixIcon={<AddChart size="18px" />}
            onClick={() => onOpenChange(!open)}
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
          <Dialog.Title>
            <Box>
              <AddChart size={22} />
              Add widget
            </Box>
          </Dialog.Title>

          <StyledDescription>
            <Metrics>
              {[
                {
                  label: metricTypeLabel[MetricType.LATENCY],
                  value: MetricType.LATENCY,
                  iconUrl: "/assets/metric-read-latency.svg",
                },
                {
                  label: metricTypeLabel[MetricType.WRITE_AMPLIFICATION],
                  value: MetricType.WRITE_AMPLIFICATION,
                  iconUrl: "/assets/metric-write-amplification.svg",
                },
                {
                  label: metricTypeLabel[MetricType.ROWS_APPLIED],
                  value: MetricType.ROWS_APPLIED,
                  iconUrl: "/assets/metric-rows-applied.svg",
                },
              ].map((metric) => (
                <Metric
                  key={metric.value}
                  onClick={() => handleSelectMetric(metric.value)}
                >
                  <Image>
                    <img
                      src={metric.iconUrl}
                      alt={`${metric.label} icon`}
                      width="64"
                      height="64"
                    />
                  </Image>
                  <Text color="foreground" weight={600}>
                    {metric.label}
                  </Text>
                </Metric>
              ))}
            </Metrics>
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
          </Dialog.ActionButtons>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
