import styled, { css, keyframes } from "styled-components"
import { Notification2 } from "styled-icons/remix-line"

const angle = "10deg"
const swingFrames = keyframes`
  0%, 50%, 100% {
    transform: rotate(0);
  }

  10%, 20%, 30% {
    transform: rotate(-${angle});
  }

  15%, 25%, 40% {
    transform: rotate(${angle});
  }
`

const swing = css`
  animation: ${swingFrames} 2s infinite ease-in-out;
  transform-origin: 50% 0;
`

export const Bell = styled(Notification2)<{ $unread: boolean }>`
  color: ${({ theme, $unread }) => theme.color[$unread ? "red" : "foreground"]};

  ${({ $unread }) => $unread && swing}
`
