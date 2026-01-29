import React, { useState } from "react"
import styled from "styled-components"
import {
  Warning,
  ArrowSquareOut,
  CaretRight,
  BellSimpleRinging,
} from "@phosphor-icons/react"
import { Text, Button } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { type HealthIssue, ISSUE_DOCS_URLS } from "./healthCheck"

type Props = {
  warnings: HealthIssue[]
  onAskAI?: (warning: HealthIssue) => void
  defaultExpanded?: boolean
}

const SectionContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  gap: 2rem;
`

const SectionHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  width: 100%;
`

const CaretIcon = styled(CaretRight)<{ $expanded: boolean }>`
  color: ${({ theme }) => theme.color.foreground};
  transition: transform 150ms ease;
  transform: rotate(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
  flex-shrink: 0;
`

const BellIcon = styled(BellSimpleRinging)`
  color: ${({ theme }) => theme.color.foreground};
  flex-shrink: 0;
`

const SectionTitle = styled(Text).attrs({
  color: "foreground",
  size: "lg",
  weight: 600,
})``

const AlertsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  gap: 1.25rem;
`

const AlertItem = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  gap: 1.5rem;
  overflow: hidden;
`

const OrangeBorder = styled.div`
  width: 0.125rem;
  flex-shrink: 0;
  align-self: stretch;
  background: ${({ theme }) => theme.color.orange};
`

const AlertContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  gap: 0.125rem;
`

const AlertHeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
`

const AlertTitle = styled(Text).attrs({
  color: "foreground",
  size: "sm",
  weight: 600,
})`
  flex: 1;
  min-width: 0;
`

const AlertBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 1.5rem;
  padding: 1rem 0;
  width: 100%;
`

const MetricsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  width: 100%;
  border-radius: 0.3125rem;
  overflow: hidden;
`

const MetricBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.1875rem;
  flex: 1;
  min-width: 0;
  padding: 0.625rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

const ActionsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`

const DocsLink = styled.a`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.cyan};
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: 600;
  padding: 0;
  letter-spacing: 0.01em;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  svg {
    flex-shrink: 0;
  }
`

const AskAIButton = styled(Button).attrs({
  skin: "gradient",
})`
  padding: 0 0.625rem;
  gap: 0.5rem;
`

const WarningIconStyled = styled(Warning)`
  color: ${({ theme }) => theme.color.orange};
  flex-shrink: 0;
`

const getAlertDetails = (
  warning: HealthIssue,
): {
  title: string
  currentLabel?: string
  optimalLabel?: string
  optimalValue?: string
} => {
  switch (warning.field) {
    case "transactionLag":
      return {
        title: "Transaction lag increasing",
      }
    case "pendingRows":
      return {
        title: "Pending rows accumulating",
      }
    case "writeAmp":
      return {
        title: "High write amplification (O3 overhead)",
        currentLabel: "Write Amplification (p50)",
        optimalLabel: "Optimal Range",
        optimalValue: "1.01 – 2.99x",
      }
    case "txSizeP90":
      return {
        title: "Small transactions - consider batching",
        currentLabel: "Transaction Size (p90)",
        optimalLabel: "Optimal Range",
        optimalValue: "> 100 rows",
      }
    case "memoryPressure":
      return {
        title: "High memory pressure",
        currentLabel: "Memory Pressure",
        optimalLabel: "Optimal",
        optimalValue: "None",
      }
    case "mergeRate":
      return {
        title: "Low merge rate detected",
        currentLabel: "Merge Rate (p99)",
        optimalLabel: "Optimal",
        optimalValue: "> 100 rows/s",
      }
    default:
      return {
        title: warning.message,
      }
  }
}

export const PerformanceAlerts = ({
  warnings,
  onAskAI,
  defaultExpanded = true,
}: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (warnings.length === 0) return null

  return (
    <SectionContainer>
      <SectionHeader onClick={() => setExpanded(!expanded)}>
        <CaretIcon size={14} weight="bold" $expanded={expanded} />
        <BellIcon size={16} weight="bold" />
        <SectionTitle>Performance Alerts</SectionTitle>
      </SectionHeader>

      {expanded && (
        <AlertsContainer>
          {warnings.map((warning) => {
            const details = getAlertDetails(warning)

            return (
              <AlertItem key={warning.id}>
                <OrangeBorder />
                <AlertContent>
                  <AlertHeaderRow>
                    <WarningIconStyled size={16} weight="fill" />
                    <AlertTitle>{details.title}</AlertTitle>
                  </AlertHeaderRow>

                  <AlertBody>
                    {details.optimalValue && (
                      <MetricsRow>
                        <MetricBox>
                          <Text color="gray2" size="sm">
                            {details.currentLabel ?? "Current"}
                          </Text>
                          <Text color="foreground">
                            {warning.currentValue ?? "N/A"}
                          </Text>
                        </MetricBox>
                        <MetricBox>
                          <Text color="gray2" size="sm">
                            {details.optimalLabel ?? "Optimal"}
                          </Text>
                          <Text color="foreground">{details.optimalValue}</Text>
                        </MetricBox>
                      </MetricsRow>
                    )}
                    <ActionsRow>
                      {ISSUE_DOCS_URLS[warning.id] && (
                        <DocsLink
                          href={ISSUE_DOCS_URLS[warning.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View explanation in docs
                          <ArrowSquareOut size={14} />
                        </DocsLink>
                      )}
                      <AskAIButton
                        prefixIcon={<AISparkle size={14} variant="hollow" />}
                        onClick={() => onAskAI?.(warning)}
                      >
                        Ask AI
                      </AskAIButton>
                    </ActionsRow>
                  </AlertBody>
                </AlertContent>
              </AlertItem>
            )
          })}
        </AlertsContainer>
      )}
    </SectionContainer>
  )
}
