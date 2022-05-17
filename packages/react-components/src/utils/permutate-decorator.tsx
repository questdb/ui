import React from "react";
import styled from "styled-components";

import type { permutate } from "./permutate";

const Grid = styled.div`
  display: grid;
  gap: 5rem 1rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
`;

const Description = styled.pre`
  color: #fff;
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const permutateDecorator =
  (permutations: ReturnType<typeof permutate>) =>
  (Story: any, { args }: { args: any }) =>
    (
      <Grid>
        {permutations.map((props, i) => {
          const description = JSON.stringify(props, null, 2);
          return (
            <Cell key={i}>
              <Story args={{ ...props, ...args }} />
              <Description>{description}</Description>
            </Cell>
          );
        })}
      </Grid>
    );
