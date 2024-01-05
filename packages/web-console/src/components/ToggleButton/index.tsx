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
import styled, { css, ThemeConsumer } from "styled-components"

import type { Color, FontSize } from "../../types"
import { color } from "../../utils"

import { ButtonProps, getButtonSize } from "../Button"
import { bezierTransition } from "../Transition"

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
  selected: false,
  size: "md",
  type: "button",
  readOnly: false,
}

type DefaultProps = typeof defaultProps

type Props = Readonly<{
  direction: Direction
  selected: boolean
  readOnly?: boolean
}> &
  ButtonProps

type RenderRefProps = Omit<Props, keyof DefaultProps> & Partial<DefaultProps>

type ThemeShape = {
  background: Color
}

const baseStyles = css<Props>`
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ selected, theme }) =>
    selected ? "#2d303e" : "transparent"};
  border: none;
  outline: 0;
  font-size: ${({ fontSize, theme }) => theme.fontSize[fontSize]};
  font-weight: 400;
  line-height: 1.15;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 0.4rem;
  cursor: pointer;
  ${bezierTransition};
  ${({ disabled }) => disabled && "cursor: default; pointer-events: none;"};
  color: ${({ selected, theme }) =>
    theme.color[selected ? "foreground" : "offWhite"]};

  svg + span,
  img + span {
    margin-left: 1rem;
  }
`

const getTheme = (normal: ThemeShape, hover: ThemeShape) =>
  css<Props>`
    &:hover:not([disabled]) {
      background: ${color(hover.background)};
      opacity: 1;
    }

    &:active:not([disabled]) {
      filter: brightness(90%);
    }

    ${({ readOnly }) =>
      readOnly &&
      `
      filter: brightness(0.5);
      cursor: default;
    `}
  `

const PrimaryToggleButtonStyled = styled.button<Props>`
  ${baseStyles};
  ${getTheme(
    {
      background: "backgroundDarker",
    },
    {
      background: "comment",
    },
  )};
`

const PrimaryToggleButtonWithRef = (
  props: RenderRefProps,
  ref: Ref<HTMLButtonElement>,
) => <PrimaryToggleButtonStyled {...defaultProps} {...props} ref={ref} />

export const PrimaryToggleButton = forwardRef(PrimaryToggleButtonWithRef)

PrimaryToggleButton.defaultProps = defaultProps
