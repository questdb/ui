import styled from "styled-components";
import React from "react";

type Props = {
  children: React.ReactNode;
  columns?: number;
  gap?: string;
};

const Root = styled.div<Props>`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(${({ columns }) => columns}, minmax(0, 1fr));
  gap: ${({ gap }) => gap};
`;

export const FormGroup = ({ children, columns, gap = "2rem" }: Props) => (
  <Root
    columns={columns ?? React.Children.count(React.Children.toArray(children))}
    gap={gap}
  >
    {children}
  </Root>
);
