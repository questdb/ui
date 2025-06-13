import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import styled from "styled-components";

export const DropdownMenu = {
  Root: RadixDropdownMenu.Root,

  Trigger: styled(RadixDropdownMenu.Trigger)`
    cursor: pointer;
  `,

  Portal: styled(RadixDropdownMenu.Portal)``,

  Content: styled(RadixDropdownMenu.Content)`
    display: grid;
    gap: 0.5rem;
    min-width: 22rem;
    background: ${({ theme }) => theme.color.backgroundLighter};
    border-radius: ${({ theme }) => theme.borderRadius};
    box-shadow: 0 5px 5px 0 ${({ theme }) => theme.color.black40};
    padding: 1rem 0;
  `,

  Arrow: styled(RadixDropdownMenu.Arrow)`
    fill: ${({ theme }) => theme.color.black40};
  `,

  Item: styled(RadixDropdownMenu.Item)`
    border-radius: 3px;
    display: flex;
    gap: 1.5rem;
    align-items: center;
    padding: 0.5rem 1rem;
    margin: 0 0.5rem;
    user-select: none;
    outline: none;

    &[data-disabled] {
      pointer-events: none;
      opacity: 0.8;
    }

    &:focus {
      background: ${({ theme }) => theme.color.comment};
      cursor: pointer;
    }
  `,

  Divider: styled.div`
    height: 1px;
    background: ${({ theme }) => theme.color.selection};
    margin: 0.5rem 0;
  `,
};
