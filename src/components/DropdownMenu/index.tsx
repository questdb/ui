import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import styled from "styled-components"

export const DropdownMenu = {
  Root: RadixDropdownMenu.Root,

  Trigger: styled(RadixDropdownMenu.Trigger)`
    cursor: pointer;
  `,

  Portal: styled(RadixDropdownMenu.Portal)``,

  Content: styled(RadixDropdownMenu.Content)`
    background-color: ${({ theme }) => theme.color.backgroundDarker};
    border-radius: 0.5rem;
    padding: 0.4rem;
    box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.36);
    z-index: 9999;
    min-width: 16rem;
  `,

  Arrow: styled(RadixDropdownMenu.Arrow)`
    fill: ${({ theme }) => theme.color.black40};
  `,

  Item: styled(RadixDropdownMenu.Item)`
    font-size: 1.4rem;
    cursor: pointer;
    color: ${({ theme }) => theme.color.foreground};
    display: flex;
    gap: 1rem;
    min-height: 3rem;
    align-items: center;
    padding: 0.5rem 1rem;
    border-radius: 0.4rem;
    user-select: none;
    outline: none;

    &[data-highlighted] {
      background: ${({ theme }) => theme.color.tableSelection};
    }

    &[data-disabled] {
      opacity: 0.5;
      pointer-events: none;
    }
  `,

  Divider: styled.div`
    height: 1px;
    background: ${({ theme }) => theme.color.selection};
    margin: 0.3rem 0;
  `,
}
