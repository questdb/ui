/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, { forwardRef, Ref } from "react"
import styled from "styled-components"

import type { FontSize } from "../../types"

import { ButtonProps } from "../Button"
import { SegmentedControlButton } from "../SegmentedControl"

type Direction = "top" | "right" | "bottom" | "left"

const defaultProps: {
  direction: Direction
  fontSize: FontSize
  selected: boolean
  size: ButtonProps["size"]
  type: ButtonProps["type"]
  readOnly?: boolean
} = {
  direction: "bottom",
  fontSize: "md",
  readOnly: false,
  selected: false,
  size: "md",
  type: "button",
}

type DefaultProps = typeof defaultProps

type Props = Readonly<{
  direction: Direction
  selected: boolean
  readOnly?: boolean
}> &
  ButtonProps

type RenderRefProps = Omit<Props, keyof DefaultProps> & Partial<DefaultProps>

const PrimaryToggleButtonStyled = styled(SegmentedControlButton)<Props>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  font-size: ${({ fontSize, theme }) =>
    fontSize ? theme.fontSize[fontSize] : theme.fontSize.md};

  ${({ disabled }) => disabled && "cursor: default; pointer-events: none;"};

  svg + span,
  img + span {
    margin-left: 1rem;
  }

  ${({ readOnly, theme }) =>
    readOnly &&
    `
      background: transparent;
      color: ${theme.color.contentDisabled};
      filter: none;
      cursor: not-allowed;
    `}
`

const PrimaryToggleButtonWithRef = (
  props: RenderRefProps,
  ref: Ref<HTMLButtonElement>,
) => (
  <PrimaryToggleButtonStyled
    {...defaultProps}
    {...props}
    ref={ref}
    $size="md"
    $active={props.selected}
    data-selected={props.selected}
  />
)

export const PrimaryToggleButton = forwardRef(PrimaryToggleButtonWithRef)

PrimaryToggleButton.defaultProps = defaultProps
