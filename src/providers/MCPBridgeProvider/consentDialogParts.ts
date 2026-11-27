import styled from "styled-components"
import { AlertDialog } from "../../components/AlertDialog"

// The layout of the dialogs that connect the console to something on the
// user's computer: an icon, a title and a lede over a body and its actions.

export const StyledContent = styled(AlertDialog.Content)`
  padding: 0;
  display: flex;
  flex-direction: column;
`

export const Hero = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2.4rem 2.4rem 1.6rem;
  gap: 1.2rem;
`

export const IconBadge = styled.div<{ $tone?: "neutral" | "success" }>`
  width: 4.8rem;
  height: 4.8rem;
  border-radius: 0.8rem;
  border: 1px solid
    ${({ theme, $tone }) =>
      $tone === "success"
        ? theme.color.statusSuccess
        : theme.color.contentAccentStrong};
  color: ${({ theme, $tone }) =>
    $tone === "success"
      ? theme.color.statusSuccess
      : theme.color.contentAccentStrong};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

export const Title = styled(AlertDialog.Title)`
  margin: 0;
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

export const Lede = styled(AlertDialog.Description)`
  margin: 0;
  color: ${({ theme }) => theme.color.contentSecondary};
  line-height: 1.5;
  font-size: 1.4rem;
`

export const Body = styled.div`
  padding: 0 2.4rem 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;

  [aria-haspopup="menu"] {
    font-size: 1.4rem;
    font-weight: 400;
    background: ${({ theme }) => theme.color.surfaceInput};
    border-color: ${({ theme }) => theme.color.interactionNeutral};

    &:focus {
      background: ${({ theme }) => theme.color.surfaceInput};
    }
  }
`

export const Actions = styled.div`
  display: flex;
  gap: 0.8rem;
  justify-content: flex-end;
  padding: 2rem 2.4rem 2.4rem;

  @media (max-width: 28em) {
    flex-direction: column-reverse;

    > * {
      width: 100%;
    }
  }
`
