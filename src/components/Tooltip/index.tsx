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

import React from "react"
import styled, { keyframes } from "styled-components"
import * as RadixTooltip from "@radix-ui/react-tooltip"
import type { Placement } from "@popperjs/core"

import { Text } from "../Text"
import { CopyButton } from "../CopyButton"
import { color } from "../../utils"

type Props = {
  content: React.ReactNode | null
  placement?: Placement
  copyTooltip?: boolean
  delay?: number
  children: React.ReactNode
}

const slideUpAndFade = keyframes`
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`

const slideDownAndFade = keyframes`
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`

const slideLeftAndFade = keyframes`
  from {
    opacity: 0;
    transform: translateX(2px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`

const slideRightAndFade = keyframes`
  from {
    opacity: 0;
    transform: translateX(-2px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`

const StyledArrowSvg = styled.svg`
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

// Custom arrow with border - using asChild to replace default polygon
const ArrowWithBorder = React.forwardRef<SVGSVGElement>((props, ref) => (
  <StyledArrowSvg
    {...props}
    ref={ref}
    width={14}
    height={7}
    viewBox="0 0 14 7"
    preserveAspectRatio="none"
  >
    <polygon points="0,0 14,0 7,7" fill="var(--tooltip-bg)" />
    <polyline
      points="0,0 7,7 14,0"
      fill="none"
      stroke="var(--tooltip-border)"
      strokeWidth="1"
    />
  </StyledArrowSvg>
))

const TooltipContent = styled(RadixTooltip.Content)`
  --tooltip-bg: ${color("backgroundDarker")};
  --tooltip-border: ${color("gray1")};

  position: relative;
  max-width: 460px;
  padding: 1rem;
  background: var(--tooltip-bg);
  border: 1px solid var(--tooltip-border);
  border-radius: 6px;
  z-index: 1000;
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, opacity;

  &[data-state="delayed-open"][data-side="top"] {
    animation-name: ${slideDownAndFade};
  }
  &[data-state="delayed-open"][data-side="bottom"] {
    animation-name: ${slideUpAndFade};
  }
  &[data-state="delayed-open"][data-side="left"] {
    animation-name: ${slideRightAndFade};
  }
  &[data-state="delayed-open"][data-side="right"] {
    animation-name: ${slideLeftAndFade};
  }
`

const ContentWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`

const StyledCopyButton = styled(CopyButton)`
  background: transparent;
`

const mapPlacementToSide = (
  placement: Placement,
): "top" | "right" | "bottom" | "left" => {
  if (placement.startsWith("top")) return "top"
  if (placement.startsWith("bottom")) return "bottom"
  if (placement.startsWith("left")) return "left"
  if (placement.startsWith("right")) return "right"
  return "bottom"
}

const mapPlacementToAlign = (
  placement: Placement,
): "start" | "center" | "end" => {
  if (placement.endsWith("-start")) return "start"
  if (placement.endsWith("-end")) return "end"
  return "center"
}

export const Tooltip = ({
  content,
  placement = "bottom",
  copyTooltip = false,
  delay = 200,
  children,
}: Props): JSX.Element => {
  if (!content) return <>{children}</>
  return (
    <RadixTooltip.Provider delayDuration={delay}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <TooltipContent
            side={mapPlacementToSide(placement)}
            align={mapPlacementToAlign(placement)}
            sideOffset={0}
          >
            <Text color="foreground">
              {copyTooltip && typeof content === "string" ? (
                <ContentWrapper>
                  {content}
                  <StyledCopyButton text={content} size="sm" iconOnly />
                </ContentWrapper>
              ) : (
                content
              )}
            </Text>
            <RadixTooltip.Arrow asChild width={14} height={7}>
              <ArrowWithBorder />
            </RadixTooltip.Arrow>
          </TooltipContent>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
