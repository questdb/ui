import styled, { keyframes } from "styled-components"

// Static silhouette. The sheen lives in ShimmerSweep — animating each bar's
// background ran the style engine on the main thread for every bar, every
// frame, and a placeholder-heavy notebook holds thousands of bars.
export const ShimmerBar = styled.div`
  border-radius: 2px;
  background: ${({ theme }) => theme.color.backgroundLighter};
  /* the 14 suffix is ~8% alpha on the theme hex */
  background-image: linear-gradient(
    ${({ theme }) => theme.color.comment}14,
    ${({ theme }) => theme.color.comment}14
  );
`

const sweep = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(300%); }
`

// One compositor-driven sheen per placeholder surface. The host needs
// position: relative, overflow: hidden, and content-visibility: auto — the
// last one lets the browser skip offscreen surfaces entirely, so only the
// few sweeps near the viewport ever tick. Host size must come from the
// parent (it does everywhere), or size containment would collapse it.
export const ShimmerSweep = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 50%;
  pointer-events: none;
  /* Compositor-promote the sweep so it animates off the main thread.
     content-visibility on the host keeps the layer count to the few
     surfaces actually rendered. */
  will-change: transform;
  /* the 22 suffix is ~13% alpha on the theme hex */
  background: linear-gradient(
    90deg,
    transparent,
    ${({ theme }) => theme.color.comment}22,
    transparent
  );
  animation: ${sweep} 1.6s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
