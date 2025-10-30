import React, { MouseEvent, ReactNode } from "react";
import styled, { css } from "styled-components";
import type { FontSize } from "../../types";
import type { Skin } from "./skin";
import { makeSkin } from "./skin";

export const sizes = ["sm", "md", "lg"] as const;
export type Size = typeof sizes[number];
type Type = "button" | "submit";

export type ButtonProps = {
  as?: React.ElementType;
  skin?: Skin;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  fontSize?: FontSize;
  onClick?: (event: MouseEvent) => void;
  size?: Size;
  type?: Type;
  title?: string;
  rounded?: boolean;
  prefixIcon?: React.ReactNode;
  dataHook?: string;
};

const Prefix = styled.div<{ disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.5rem;
  pointer-events: none;
  filter: ${({ disabled }) => (disabled ? "grayscale(100%)" : "none")};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

export const Button: React.FunctionComponent<ButtonProps> = React.forwardRef(
  ({ as, children, prefixIcon, disabled, ...props }, ref) => {
    const type = as === "button" ? { type: "button" } : {};
    return (
      <StyledButton
        ref={ref}
        as={as ?? "button"}
        disabled={disabled}
        data-hook={props.dataHook}
        {...props}
        {...type}
      >
        {prefixIcon && <Prefix disabled={disabled}>{prefixIcon}</Prefix>}
        {children}
      </StyledButton>
    );
  }
);

const StyledButton = styled.div<ButtonProps>`
  display: inline-flex;
  height: ${getSize};
  padding: 0 1rem;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-radius: 4px;
  border: 1px solid transparent;
  outline: 0;
  font-weight: 400;
  line-height: 1.15;
  cursor: pointer;

  svg + span {
    margin-left: 0.5rem;
  }

  ${(props) =>
    props.rounded &&
    css`
      border-radius: 50%;
      width: ${getSize};
      height: ${getSize};
      padding: 0;
    `}

  ${(props) =>
    props.disabled &&
    `
    cursor: default;
  `}

  ${(props) => makeSkin(props.skin ?? "primary")}
`;

function getSize({ size }: { size?: Size }) {
  const sizes = {
    sm: "2rem",
    md: "3rem",
    lg: "5rem",
  };
  return sizes[size ?? "md"];
}
