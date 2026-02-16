import React from "react"
import styled, { css, keyframes } from "styled-components"

export enum BadgeType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  DISABLED = "disabled",
}

type Props = {
  type: BadgeType
  icon?: React.ReactNode
  pulsate?: boolean
  children?: React.ReactNode
  className?: string
  "data-hook"?: string
}

const pulsate = keyframes`
  0% {
    opacity: 0.075;
  }
  
  50% {
    opacity: 0.3;
  }

  100% {
    opacity: 0.075;
  }
`

const Root = styled.span<Pick<Props, "type" | "pulsate">>`
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0 1rem;
  border: 1px solid transparent;
  border-radius: 0.8rem;
  line-height: 1.15;
  height: 3rem;
  color: ${({ theme }) => theme.color.white};
  background: ${({ theme }) => theme.color.background};

  &:after {
    content: "";
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    opacity: 0.075;
    border-radius: 0.7rem;
  }

  ${({ type, theme }) =>
    type === BadgeType.INFO &&
    css`
      color: ${theme.color.cyan};
    `}

  ${({ type, theme }) =>
    type === BadgeType.ERROR &&
    css`
      color: ${theme.color.red};

      &:after {
        background: ${theme.color.red};
      }
    `}

  ${({ type, theme }) =>
    type === BadgeType.SUCCESS &&
    css`
      color: ${theme.color.green};

      &:after {
        background: ${theme.color.green};
      }
    `}

  ${({ type, theme }) =>
    type === BadgeType.WARNING &&
    css`
      color: ${theme.color.orange};

      &:after {
        background: ${theme.color.orange};
      }
    `}

  ${({ type, theme }) =>
    type === BadgeType.DISABLED &&
    css`
      color: ${theme.color.gray2};

      &:after {
        background: transparent;
      }
    `}

  ${(props) =>
    props.pulsate &&
    css`
      &:after {
        animation: ${pulsate} 3s linear infinite;
      }
    `};
`

const Icon = styled.div<{ hasGap: boolean }>`
  display: flex;
  justify-content: center;
  align-items: center;

  ${({ hasGap }) =>
    hasGap &&
    css`
      margin-right: 0.5rem;
    `}
`

export const Badge: React.FunctionComponent<Props> = ({
  type,
  icon,
  pulsate,
  children,
  className,
  "data-hook": dataHook,
}) => (
  <Root
    className={className}
    type={type}
    pulsate={pulsate}
    data-hook={dataHook}
  >
    {icon && <Icon hasGap={React.Children.count(children) > 0}>{icon}</Icon>}
    {children}
  </Root>
)
