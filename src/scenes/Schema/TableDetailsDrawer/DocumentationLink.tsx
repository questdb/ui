import React from "react"
import styled from "styled-components"
import { ExternalLink } from "../../../components/icons"

const Root = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.statusInfo};
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: 600;
  padding: 0;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  svg {
    flex-shrink: 0;
  }
`

export const DocumentationLink = ({
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <Root target="_blank" rel="noopener noreferrer" {...props}>
    {children}
    <ExternalLink size={14} />
  </Root>
)
