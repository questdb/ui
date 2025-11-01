import React, { forwardRef } from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const Checkbox: React.FunctionComponent<Props> = forwardRef<
  HTMLInputElement,
  Props
>((props, ref) => <input ref={ref} type="checkbox" {...props} />);

Checkbox.displayName = "Checkbox";
