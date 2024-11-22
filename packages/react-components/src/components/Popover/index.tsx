import styled from "styled-components";
import * as RadixPopover from "@radix-ui/react-popover";
import type { PopoverProps } from "@radix-ui/react-popover";
import { X } from "@styled-icons/bootstrap/X";
import React from "react";
import { Heading } from "../Heading";

const ALIGN_OPTIONS: readonly ["start", "center", "end"] = [
  "start",
  "center",
  "end",
];
export type Align = (typeof ALIGN_OPTIONS)[number];

const StyledPopoverContent = styled(RadixPopover.Content)`
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => theme.color.selection};
  box-shadow: 0 7px 30px -10px ${({ theme }) => theme.color.black};
  outline: none;
`;

const StyledPopoverClose = styled(RadixPopover.Close).attrs({
  "aria-label": "Close",
  asChild: true,
})`
  appearance: initial;
  margin-left: auto;
  cursor: pointer;
`;

const Header = styled.div`
  display: flex;
  padding: 2rem;
  align-items: center;
  justify-content: space-between;
  border-bottom: 0.1rem ${({ theme }) => theme.color.background} solid;
`;

const ContentWrapper = styled.div`
  width: 100%;
`;

type Props = {
  children: React.ReactNode;
  withCloseButton?: boolean;
  trigger: React.ReactNode;
  width?: number | string;
  title?: string;
  open?: PopoverProps["open"];
  onOpenChange?: (isOpen: boolean) => void;
  align?: Align;
};

export const Popover = ({
  children,
  withCloseButton = false,
  width,
  trigger,
  title,
  open,
  onOpenChange,
  align,
}: Props) => (
  <RadixPopover.Root onOpenChange={onOpenChange} open={open}>
    <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
    <StyledPopoverContent
      style={{ width: width ?? "auto" }}
      align={align}
      sideOffset={10}
    >
      {(title || withCloseButton) && (
        <Header>
          {title && <Heading level={5}>{title}</Heading>}
          {withCloseButton && (
            <StyledPopoverClose>
              <X size="18px" />
            </StyledPopoverClose>
          )}
        </Header>
      )}
      <ContentWrapper>{children}</ContentWrapper>
    </StyledPopoverContent>
  </RadixPopover.Root>
);
