import styled from "styled-components"

// The frame above a left panel's list (Schema, Tabs, Search). The panels share
// it so their filter rows sit on the same line.
export const PaneHeader = styled.div`
  flex-shrink: 0;
  padding: 1.2rem 1.4rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

// A row of the header, as tall as the filter input.
export const PaneHeaderRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 4.5rem;
`
