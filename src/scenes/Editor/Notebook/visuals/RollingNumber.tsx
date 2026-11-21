import React, { useState } from "react"
import styled, { keyframes } from "styled-components"
import {
  compareValues,
  type Numeric,
} from "../../../../components/ResultGrid/highlight/comparable"

type Direction = "up" | "down"

const AccessiblePrice = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`

const enter = keyframes`
  from { transform: translateY(var(--digit-travel)); }
  to { transform: translateY(0); }
`

const exit = keyframes`
  from { transform: translateY(0); }
  to { transform: translateY(calc(-1 * var(--digit-travel))); }
`

const Digit = styled.span<{ $direction: Direction }>`
  --digit-travel: ${({ $direction }) =>
    $direction === "up" ? "100%" : "-100%"};
  position: relative;
  display: inline-block;
  clip-path: inset(0);

  > span:first-child {
    position: absolute;
    inset: 0;
    animation: ${exit} 180ms ease-out forwards;
  }

  > span:last-child {
    display: inline-block;
    animation: ${enter} 180ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    > span:first-child {
      display: none;
    }

    > span:last-child {
      animation: none;
    }
  }
`

type PriceFrame = {
  value: Numeric | null
  text: string
  previousText?: string
  direction?: Direction
  revision: number
}

const digitLayout = (text: string) => text.replace(/\d/g, "0")

export const RollingNumber = ({
  value,
  text,
  enabled,
  showDirection,
}: {
  value: Numeric | null
  text: string
  enabled: boolean
  showDirection?: boolean
}) => {
  const [frame, setFrame] = useState<PriceFrame>({ value, text, revision: 0 })
  // Compare visible prices so rounding doesn't trigger motion or flip the arrow.
  if (frame.text !== text) {
    const comparison =
      value === null || frame.value === null
        ? 0
        : compareValues(value, frame.value)
    const direction =
      comparison > 0 ? "up" : comparison < 0 ? "down" : undefined
    setFrame({
      value,
      text,
      direction,
      previousText:
        enabled && direction && digitLayout(frame.text) === digitLayout(text)
          ? frame.text
          : undefined,
      revision: frame.revision + 1,
    })
  }
  const { previousText, direction, revision } = frame
  const arrow = !showDirection
    ? ""
    : direction === "up"
      ? " ↑"
      : direction === "down"
        ? " ↓"
        : ""
  if (!enabled || !previousText || !direction)
    return (
      <span data-direction={showDirection ? direction : undefined}>
        {text}
        {arrow}
      </span>
    )

  return (
    <span data-direction={showDirection ? direction : undefined}>
      <AccessiblePrice>
        {text}
        {arrow}
      </AccessiblePrice>
      <span aria-hidden="true">
        {Array.from(
          text.matchAll(/\d|\D+/g),
          ({ 0: character, index: offset }) => {
            const previous = previousText.slice(
              offset,
              offset + character.length,
            )
            return previous !== character ? (
              <Digit
                key={`digit:${offset}:${revision}`}
                $direction={direction}
                data-hook="rolling-digit"
              >
                <span>{previous}</span>
                <span>{character}</span>
              </Digit>
            ) : (
              <React.Fragment key={`character:${offset}`}>
                {character}
              </React.Fragment>
            )
          },
        )}
        {arrow}
      </span>
    </span>
  )
}
