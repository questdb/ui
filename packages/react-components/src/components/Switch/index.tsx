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
  width: 38px;
  height: 21px;
  border-radius: 11px;
  border: 1px solid #9580ff;
  background: transparent;
  appearance: none;
  position: relative;

  &:focus: {
    box-shadow: 0 0 0 2px black;
  }

  &[data-disabled] {
    border-color: #5f5c70;
  }

  &[data-state="checked"][data-disabled] {
    border-color: #928fa3;
  }
`;

const StyledThumb = styled(SwitchPrimitive.Thumb)`
  display: block;
  position: absolute;
  left: 2px;
  top: 2px;
  width: 15px;
  height: 15px;
  background-color: #fff;
  border-radius: 50%;
  transition: linear transform 100ms;
  transform: translateX(0);
  will-change: transform;

  &[data-state="checked"] {
    transform: translateX(18px);
    background-color: #9580ff;
  }

  &[data-disabled] {
    background-color: #5f5c70;
  }

  &[data-state="checked"][data-disabled] {
    background-color: #928fa3;
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
