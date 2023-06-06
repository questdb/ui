import React from "react";
import styled from "styled-components";
import { CardHeader } from "./card-header";
import { CardContent } from "./card-content";

type Props = {
  children: React.ReactNode;
  hover?: boolean;
  className?: string;
};

const Root = styled.div<Pick<Props, "hover">>`
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: ${({ theme }) => theme.color.backgroundLighter};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid transparent;

  ${({ hover, theme }) =>
    hover &&
    ` 
      &:hover {
        border-color: ${theme.color.selection};
      }
  `};
`;

type CardFooterProps = {
  align: React.CSSProperties["justifyContent"];
};

// how to use `attrs` with typescript?
// see more at https://github.com/styled-components/styled-components/issues/1959#issuecomment-781272613
const CardFooter = styled.div.attrs<CardFooterProps, CardFooterProps>(
  (props) => ({
    align: props.align ?? "flex-end",
  })
)`
  display: flex;
  width: 100%;
  justify-content: ${(props) => props.align};
  align-items: center;
  gap: 1rem;
  padding: 1rem 2rem;
  border-top: 1px ${({ theme }) => theme.color.selectionDarker} solid;
`;

export const Card = ({ className, children, hover }: Props) => (
  <Root hover={hover} className={className}>
    {children}
  </Root>
);

Card.Header = CardHeader;
Card.Content = CardContent;
Card.Footer = CardFooter;
