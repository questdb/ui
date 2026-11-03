import { css } from "styled-components"
import { color } from "../../utils"

export const editorStageSurfaceStyles = css`
  background-color: ${color("surfaceStage")};
  background-image: radial-gradient(
    ${({ theme }) => theme.color.interactionHover} 0.7px,
    transparent 0.7px
  );
  background-size: 16px 16px;
`

export const EDITOR_CARD_HEADER_HEIGHT = "4.2rem"

export const editorCardHeaderStyles = css`
  height: ${EDITOR_CARD_HEADER_HEIGHT};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  background: ${color("surfaceInset")};
`
