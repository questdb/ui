import React, { SVGProps } from "react"
import styled from "styled-components"
import { Tooltip } from "../../../components"
import type { HealthSeverity } from "./healthCheck"

type Props = {
  severity: HealthSeverity
}

const LabelContainer = styled.div<{ $severity: HealthSeverity }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 0.9rem;
  border-radius: 0.4rem;
  flex-shrink: 0;
  background: ${({ theme, $severity }) => {
    switch ($severity) {
      case "critical":
        return `${theme.color.statusDanger}1F`
      case "warning":
        return `${theme.color.statusWarning}1F`
      case "unknown":
        return `${theme.color.contentDisabled}1F`
      case "recovering":
      case "healthy":
      default:
        return `${theme.color.statusSuccess}1F`
    }
  }};
`

const Square = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 1 1"
    fill="currentColor"
    preserveAspectRatio="none"
    {...props}
  >
    <rect x="0" y="0" width="1" height="1" rx="0.15" fill="currentColor" />
  </svg>
)

export const SquareWithShadow = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 1 1"
    fill="currentColor"
    preserveAspectRatio="none"
    {...props}
  >
    <rect
      x="0.1"
      y="0.1"
      width="0.8"
      height="0.8"
      rx="0.15"
      fill="currentColor"
    />
    <rect
      x="0.05"
      y="0.05"
      width="0.9"
      height="0.9"
      rx="0.15"
      stroke="currentColor"
      strokeOpacity="0.32"
      strokeWidth="0.1"
      fill="none"
    />
  </svg>
)

const StatusSquare = styled(Square)<{ $severity: HealthSeverity }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 8px;
  color: ${({ theme, $severity }) => {
    switch ($severity) {
      case "critical":
        return theme.color.statusDanger
      case "warning":
        return theme.color.statusWarning
      case "unknown":
        return theme.color.contentDisabled
      case "recovering":
      case "healthy":
      default:
        return theme.color.statusSuccess
    }
  }};
`

export const HealthStatusLabel = ({ severity }: Props) => {
  const statusText =
    severity === "critical"
      ? "Error"
      : severity === "warning"
        ? "Warning"
        : severity === "unknown"
          ? "Unknown"
          : "Healthy"

  return (
    <Tooltip content={statusText}>
      <LabelContainer
        $severity={severity}
        aria-label={statusText}
        data-hook="table-details-health-status"
        data-severity={severity}
        tabIndex={0}
      >
        <StatusSquare $severity={severity} />
      </LabelContainer>
    </Tooltip>
  )
}
