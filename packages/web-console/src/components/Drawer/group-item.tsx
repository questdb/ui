import styled from "styled-components";

export const DrawerGroupItem = styled.div<{
  withLink?: boolean;
  direction?: "row" | "column";
}>`
  display: flex;
  ${({ direction }) =>
    direction === "column"
      ? `
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: wrap;
  `
      : `
    justify-content: space-between;
    flex-wrap: initial;
  `};
  padding: 2rem;

  &:not(:last-child) {
    border-bottom: 0.1rem ${({ theme }) => theme.color.backgroundLighter} solid;
  }

  &:last-child {
    border-bottom-left-radius: ${({ theme }) => theme.borderRadius};
    border-bottom-right-radius: ${({ theme }) => theme.borderRadius};
  }

  ${({ theme, withLink }) =>
    withLink &&
    `
    &:hover {
      cursor: pointer;
      background-color: ${theme.color.black};
    }
  `}
`;
