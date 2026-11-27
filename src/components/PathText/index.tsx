import React from "react"
import styled from "styled-components"

// A file path on one line: paths read badly when they wrap. A long one
// scrolls sideways, and its tooltip shows it whole.
const Root = styled.span`
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.contentPrimary};
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.color.scrollbarThumb} transparent;

  &::-webkit-scrollbar {
    height: 0.4rem;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.color.scrollbarThumb};
    border-radius: 0.2rem;
  }
`

export const PathText = ({
  path,
  className,
  dataHook,
}: {
  path: string
  className?: string
  dataHook?: string
}) => (
  <Root className={className} title={path} data-hook={dataHook}>
    {path}
  </Root>
)
