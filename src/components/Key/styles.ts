import { css } from "styled-components"
import { color } from "../../utils"

/**
 * Shared shortcut-key surface used by both our React Key component and
 * third-party controls that render their own <kbd> elements (DocSearch).
 */
export const shortcutKeycapStyles = css`
  box-sizing: border-box;
  width: auto;
  height: 2.2rem;
  min-width: 2.4rem;
  margin: 0;
  padding: 0.2rem 0.55rem;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  top: 0;
  pointer-events: none;
  user-select: none;
  background: linear-gradient(
    180deg,
    ${color("surfaceInput")} 0%,
    ${color("surfaceInset")} 100%
  );
  border: 1px solid ${color("borderDefault")};
  border-radius: 0.35rem;
  box-shadow:
    inset 0 1px 0 ${({ theme }) => theme.color.borderSubtle},
    inset 0 -1px 0 ${({ theme }) => theme.color.shadowStrong},
    0 1px 1px ${({ theme }) => theme.color.shadowMedium};
  font-family: ${({ theme }) => theme.font};
  font-size: 1.2rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1;

  &:not(:last-child) {
    margin-right: 0.25rem;
  }

  svg {
    color: inherit;
  }
`
