import React from "react";
import type { ReactNode } from "react";
import { Text } from "../Text";
import { Heading } from "../Heading";
import styled from "styled-components";

const Root = styled.div`
  background: #303241;
  border-radius: 6px 6px 0 0;
  border-bottom: 1px solid #3b3e50;

  &:only-child {
    border-radius: 6px;
    border-bottom: none;
  }
`;

export const Header = styled.div`
  display: flex;
  gap: 2rem;
  align-items: center;
  padding: 1rem 2rem;
  min-height: 5rem;
`;

const AfterTitle = styled.div`
  margin-left: auto;
`;

const Titles = styled.div`
  display: grid;
  gap: 0.5rem;
`;

const Footer = styled.div`
  flex: 1 0 100%;
`;

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  beforeTitle?: ReactNode;
  afterTitle?: ReactNode;
  footer?: ReactNode;
  prefixIcon?: ReactNode;
  className?: string;
};

const has = (...value: unknown[]) =>
  value.reduce((acc, curr) => acc || curr, false);

export const CardHeader = ({
  title,
  subtitle,
  beforeTitle,
  afterTitle,
  footer,
  className,
}: Props) => (
  <Root className={className}>
    <Header>
      {has(beforeTitle) && <div>{beforeTitle}</div>}

      {has(title, subtitle) && (
        <Titles>
          {has(title) && <Heading level={5}>{title}</Heading>}
          {has(subtitle) && <Text color="white">{subtitle}</Text>}
        </Titles>
      )}

      {has(afterTitle) && <AfterTitle>{afterTitle}</AfterTitle>}
    </Header>

    {has(footer) && <Footer>{footer}</Footer>}
  </Root>
);
