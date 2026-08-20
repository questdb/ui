import * as RadixDialog from "@radix-ui/react-dialog"
import styled, { css } from "styled-components"
import { Button } from "../Button"
import { modalSurfaceStyles } from "../overlayStyles"

const dialogShow = css`
  @keyframes dialogShow {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const dialogHide = css`
  @keyframes dialogHide {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
`

export const Dialog = {
  Root: RadixDialog.Root,
  Overlay: RadixDialog.Overlay,
  Trigger: RadixDialog.Trigger,
  Portal: RadixDialog.Portal,
  Content: styled(RadixDialog.Content)<{ maxwidth?: string }>`
    ${modalSurfaceStyles}
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-width: ${({ maxwidth }) => maxwidth ?? "50rem"};
    max-height: 85vh;
    padding: 0 0 2rem 0;
    z-index: 101;

    ${dialogShow}
    ${dialogHide}

    &[data-state="open"] {
      animation: dialogShow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    &[data-state="closed"] {
      animation: dialogHide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
  `,
  Title: styled(RadixDialog.Title)`
    margin: 0;
    padding: 2rem;
    font-size: 1.6rem;
    font-weight: 600;
    line-height: 1.3;
    color: ${({ theme }) => theme.color.contentPrimary};
    border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  `,
  Description: styled(RadixDialog.Description)`
    margin-top: 2rem;
    padding: 0 2rem;
    color: ${({ theme }) => theme.color.contentPrimary};
    line-height: 1.5;
  `,
  ActionButtons: styled.div`
    display: flex;
    width: 100%;
    justify-content: flex-end;
    gap: 0.8rem;
    padding: 0 2rem;
    margin-top: 2rem;

    > button:not(:last-child) {
      margin-right: 0;
    }
  `,
  Close: RadixDialog.Close,
}

export const DialogDescription = styled(Dialog.Description)`
  font-size: 1.4rem;
`

export const DialogButton = styled(Button)`
  padding: 1.2rem 0.6rem;
  font-size: 1.4rem;
`
