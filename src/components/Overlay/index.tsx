import React from "react"
import styled, { css } from "styled-components"
import { Overlay as RadixDialogOverlay } from "@radix-ui/react-dialog"
import { Overlay as RadixAlertDialogOverlay } from "@radix-ui/react-alert-dialog"

const overlayShow = css`
  @keyframes overlayShow {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const overlayHide = css`
  @keyframes overlayHide {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
`

const StyledOverlay = styled.div`
  background-color: ${({ theme }) => theme.color.black70};
  position: fixed;
  inset: 0;
  z-index: 100;

  ${overlayShow}
  ${overlayHide}

  &[data-state="open"] {
    animation: overlayShow 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &[data-state="closed"] {
    animation: overlayHide 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
`

export const Overlay = ({
  primitive,
}: {
  primitive: typeof RadixDialogOverlay | typeof RadixAlertDialogOverlay
}) => {
  return <StyledOverlay as={primitive} />
}
