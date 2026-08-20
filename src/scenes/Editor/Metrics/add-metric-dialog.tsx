import React from "react"
import {
  Dialog,
  ForwardRef,
  Button,
  IconButton,
  Overlay,
  SelectableCardButton,
} from "../../../components"
import styled from "styled-components"
import { AddChart, Close } from "../../../components/icons"
import {
  ArrowsLeftRight,
  ChartLineUp,
  CaretRight,
  Rows,
  StackSimple,
  Timer,
} from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"
import { MetricType } from "./utils"
import { useEditor } from "../../../providers"
import merge from "lodash.merge"
import {
  DEFAULT_METRIC_COLOR_TOKEN,
  getTokenForNewMetric,
  toMetricColorToken,
} from "./metricColors"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { widgets } from "./widgets"

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
  padding: 1.6rem 2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.surfaceRaised};
`

const Title = styled(Dialog.Title)`
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 1.6rem;
`

const TitleGroup = styled.span`
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 0.8rem;
`

const TitleIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.contentAccent};
`

const Body = styled.div`
  display: grid;
  gap: 1.4rem;
  padding: 1.6rem 2rem 0;
`

const Description = styled(Dialog.Description)`
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.3rem;
  line-height: 1.8rem;
`

const Metrics = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.8rem;
`

const Metric = styled(SelectableCardButton)`
  width: 100%;
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) 2rem;
  align-items: center;
  gap: 1.2rem;
  min-height: 6.4rem;
  padding: 1rem 1.2rem;
  text-align: left;

  &:hover svg[data-arrow] {
    color: ${({ theme }) => theme.color.contentAccent};
    transform: translateX(0.2rem);
  }
`

const MetricIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border: 1px solid ${({ theme }) => theme.color.borderAccent};
  border-radius: 0.8rem;
  background: ${({ theme }) => theme.color.interactionAccentActive};
  color: ${({ theme }) => theme.color.contentAccent};
`

const MetricCopy = styled.span`
  display: grid;
  min-width: 0;
  gap: 0.3rem;
`

const MetricName = styled.span`
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 1.7rem;
`

const MetricDescription = styled.span`
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  font-weight: 400;
  line-height: 1.5rem;
`

const MetricArrow = styled(CaretRight)`
  justify-self: end;
  color: ${({ theme }) => theme.color.contentMuted};
  transition:
    color 120ms ease,
    transform 120ms ease;
`

const metricPresentation: Record<
  MetricType,
  { description: string; icon: Icon }
> = {
  [MetricType.WAL_TRANSACTION_THROUGHPUT]: {
    description: "Transactions processed per second",
    icon: ChartLineUp,
  },
  [MetricType.WAL_TRANSACTION_LATENCY]: {
    description: "90th percentile commit latency",
    icon: Timer,
  },
  [MetricType.WAL_ROW_THROUGHPUT]: {
    description: "Rows processed per second",
    icon: Rows,
  },
  [MetricType.TABLE_WRITE_AMPLIFICATION]: {
    description: "Rows written for each committed row",
    icon: ArrowsLeftRight,
  },
  [MetricType.TABLE_AVERAGE_TRANSACTION_SIZE]: {
    description: "Average rows per transaction",
    icon: StackSimple,
  },
}

const CloseButton = styled(IconButton)`
  margin: -0.4rem;
`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AddMetricDialog = ({ open, onOpenChange }: Props) => {
  const { activeBuffer, buffers, updateBuffer } = useEditor()

  const buffer = buffers.find((b) => b.id === activeBuffer?.id)

  const metrics = buffer?.metricsViewState?.metrics ?? []
  const previousMetric =
    metrics.length > 0 ? metrics[metrics.length - 1] : undefined
  const color = previousMetric
    ? getTokenForNewMetric(
        metrics.map((m) => toMetricColorToken(m.color)),
        toMetricColorToken(previousMetric.color),
      )
    : DEFAULT_METRIC_COLOR_TOKEN

  const handleSelectMetric = async (metricType: MetricType) => {
    void trackEvent(ConsoleEvent.METRIC_ADD, {
      metricType,
      count: metrics.length + 1,
    })
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <ForwardRef>
          <Button variant="secondary" prefixIcon={<AddChart size="18px" />}>
            Add widget
          </Button>
        </ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <Dialog.Content maxwidth="52rem">
          <Header>
            <Title>
              <TitleGroup>
                <TitleIcon>
                  <AddChart size={20} />
                </TitleIcon>
                Add widget
              </TitleGroup>
            </Title>
            <Dialog.Close asChild>
              <CloseButton size="sm" label="Close add widget dialog">
                <Close size={18} />
              </CloseButton>
            </Dialog.Close>
          </Header>

          <Body>
            <Description>Choose a metric to add to this dashboard.</Description>
            <Metrics>
              {Object.entries(widgets).map(([metricType, widget]) => {
                const type = metricType as MetricType
                const { description, icon: MetricTypeIcon } =
                  metricPresentation[type]

                return (
                  <Metric
                    key={metricType}
                    onClick={() => void handleSelectMetric(type)}
                  >
                    <MetricIcon>
                      <MetricTypeIcon size={22} weight="regular" />
                    </MetricIcon>
                    <MetricCopy>
                      <MetricName>{widget.label}</MetricName>
                      <MetricDescription>{description}</MetricDescription>
                    </MetricCopy>
                    <MetricArrow data-arrow size={18} weight="bold" />
                  </Metric>
                )
              })}
            </Metrics>
          </Body>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
