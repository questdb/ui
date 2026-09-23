import { css } from "styled-components"

/**
 * Compact surfaces anchored to a trigger: dropdowns, popovers and pickers.
 * Heel + weight are shared. The loom is quieter and tighter in light.
 */
export const floatingSurfaceStyles = css`
  background-color: ${({ theme }) => theme.color.surfaceOverlay};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.6rem;
  box-shadow: ${({ theme }) =>
    theme.mode === "light"
      ? `0 0.1rem 0.2rem 0 ${theme.color.shadowSoft},
         0 0.4rem 0.6rem -0.2rem ${theme.color.shadowMedium},
         0 0.8rem 0.8rem -0.4rem ${theme.color.shadowSubtle}`
      : `0 0.1rem 0.2rem 0 ${theme.color.shadowSoft},
         0 0.4rem 0.6rem -0.2rem ${theme.color.shadowMedium},
         0 1.2rem 1.6rem -0.4rem ${theme.color.shadowMedium}`};
  color: ${({ theme }) => theme.color.contentPrimary};
  outline: none;
`

/** Larger, centered modal surfaces. */
export const modalSurfaceStyles = css`
  background-color: ${({ theme }) => theme.color.surfaceOverlay};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.8rem;
  box-shadow:
    0 0.8rem 2.4rem ${({ theme }) => theme.color.shadowMedium},
    0 2.4rem 7.2rem ${({ theme }) => theme.color.shadowOverlay};
  color: ${({ theme }) => theme.color.contentPrimary};
  outline: none;
`
