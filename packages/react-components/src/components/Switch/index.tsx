import React from "react";
import styled from "styled-components";
import * as SwitchPrimitive from "@radix-ui/react-switch";

export type Props = {
  className?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  dataHook?: string;
  checked?: boolean;
};

const Root = styled(SwitchPrimitive.Root)`
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 3px;
  width: 38px;
  height: 21px;
  border-radius: 10px;
  border: 1px solid #c4c4c9;
  background: transparent;
  appearance: none;
  position: relative;
  transition: 0.2s ease-out;

  &:focus {
    border-color: #878eb6;
  }

  &[data-state="checked"] {
    background: #44475a;
  }

  &[data-disabled],
  &[data-state="checked"][data-disabled] {
    filter: grayscale(0.8) contrast(0.4);
  }
`;

const StyledThumb = styled(SwitchPrimitive.Thumb)`
  display: block;
  width: 14px;
  height: 14px;
  background-color: #d8d8d8;
  border-radius: 50%;
  transition: linear transform 100ms;
  transform: translateX(0);
  will-change: transform;

  &[data-state="checked"] {
    transform: translateX(17px);
  }

  &[data-disabled] {
    filter: brightness(0.5);
  }

  &[data-state="checked"][data-disabled] {
    filter: brightness(0.8);
  }
`;

export const Switch = ({
  checked,
  className,
  disabled,
  onChange,
  dataHook,
}: Props) => (
  <Root
    data-hook={dataHook}
    className={className}
    disabled={disabled}
    onCheckedChange={onChange}
    checked={checked}
  >
    <StyledThumb />
  </Root>
);
