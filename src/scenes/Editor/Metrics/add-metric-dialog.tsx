import React from "react"
import {
  Dialog,
  ForwardRef,
  Box,
  Button,
  Overlay,
  Text,
} from "../../../components"
import styled from "styled-components"
import { AddChart } from "@styled-icons/material"
import { MetricType } from "./utils"
import { useEditor } from "../../../providers"
import merge from "lodash.merge"
import { defaultColor, getColorForNewMetric } from "./color-palette"
import { widgets } from "./widgets"

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 2rem;
`

const Metrics = styled.div`
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(2, 1fr);
`

const Metric = styled(Box).attrs({ flexDirection: "column", gap: "0" })`
  border-radius: 0.4rem;
  cursor: pointer;
  border: 1px solid transparent;
  padding-bottom: 2rem;
  background: ${({ theme }: { theme: any }) => theme.color.backgroundLighter};

  &:hover {
    border-color: ${({ theme }: { theme: any }) => theme.color.comment};
  }
`

const Image = styled(Box).attrs({ align: "center", justifyContent: "center" })`
  width: 100%;
  height: 10rem;
`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AddMetricDialog = ({ open, onOpenChange }: Props) => {
  const { activeBuffer, buffers, updateBuffer } = useEditor()

  const buffer = buffers.find((b: any) => b.id === activeBuffer?.id)

  const metrics = buffer?.metricsViewState?.metrics ?? []
  const previousMetric =
    metrics.length > 0 ? metrics[metrics.length - 1] : undefined

  const color = previousMetric
    ? getColorForNewMetric(
        metrics.map((m: any) => m.color),
        previousMetric.color,
      )
    : defaultColor

  const handleSelectMetric = async (metricType: MetricType) => {
    if (buffer?.id) {
      const newBuffer = merge(buffer, {
        metricsViewState: {
          metrics: [
            ...(buffer.metricsViewState?.metrics ?? []),
            {
              metricType,
              position: buffer.metricsViewState?.metrics?.length ?? 0,
              color,
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
              {Object.entries(widgets).map(([metricType, widget]) => (
                <Metric
                  key={metricType}
                  onClick={() => handleSelectMetric(metricType as MetricType)}
                >
                  <Image>
                    <svg
                      width="64"
                      height="64"
                      dangerouslySetInnerHTML={{ __html: widget.icon }}
                    />
                  </Image>
                  <Text color="foreground" weight={600}>
                    {widget.label}
                  </Text>
                </Metric>
              ))}
            </Metrics>
          </StyledDescription>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
