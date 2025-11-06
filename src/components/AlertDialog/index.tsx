import * as RadixAlertDialog from "@radix-ui/react-alert-dialog"
import styled, { css } from "styled-components"

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

export const AlertDialog = {
  Root: RadixAlertDialog.Root,
  Overlay: RadixAlertDialog.Overlay,
  Trigger: RadixAlertDialog.Trigger,
  Portal: RadixAlertDialog.Portal,
  Content: styled(RadixAlertDialog.Content)<{ maxwidth?: string }>`
    background-color: ${({ theme }) => theme.color.background};
    border-radius: ${({ theme }) => theme.borderRadius};
    box-shadow: 0 7px 30px -10px ${({ theme }) => theme.color.black};
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-width: ${({ maxwidth }) => maxwidth ?? "50rem"};
    max-height: 85vh;
    padding: 0 0 2rem 0;
    border: 1px ${({ theme }) => theme.color.selection} solid;
    z-index: 101;

    ${dialogShow}
    ${dialogHide}
    
    &[data-state="open"] {
      animation: dialogShow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    &[data-state="closed"] {
      animation: dialogHide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    &:focus {
      outline: none;
    }
  `,
  Title: styled(RadixAlertDialog.Title)`
    margin: 0;
    padding: 2rem;
    font-size: 1.6rem;
    color: ${({ theme }) => theme.color.foreground};
    border-bottom: 1px ${({ theme }) => theme.color.backgroundLighter} solid;
  `,
  Description: styled.div`
    margin-top: 2rem;
    padding: 0 2rem;
    color: ${({ theme }) => theme.color.foreground};
  `,
  ActionButtons: styled.div`
    display: flex;
    width: 100%;
    justify-content: flex-end;
    padding: 0 2rem;
    margin-top: 2rem;

    > button:not(:last-child) {
      margin-right: 1rem;
    }
  `,
  Cancel: RadixAlertDialog.Cancel,
  Action: RadixAlertDialog.Action,
}
