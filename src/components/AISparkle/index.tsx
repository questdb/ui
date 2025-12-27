import React from "react"
import styled from "styled-components"

export type AISparkleVariant = "filled" | "hollow"

export type AISparkleProps = {
  size?: number
  variant?: AISparkleVariant
  className?: string
  inverted?: boolean
}

const Wrapper = styled.span<{ $size: number; $inverted: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;

  svg {
    width: 100%;
    height: 100%;
    ${({ $inverted }) => $inverted && "filter: brightness(0) invert(1);"}
  }
`

const FilledSparkle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <path
      fill="url(#aiSparkleGradientFilled)"
      d="M19.5 13.5a1.48 1.48 0 0 1-.977 1.4l-4.836 1.787-1.78 4.84a1.493 1.493 0 0 1-2.802 0l-1.793-4.84-4.839-1.78a1.492 1.492 0 0 1 0-2.802l4.84-1.793 1.78-4.839a1.492 1.492 0 0 1 2.802 0l1.792 4.84 4.84 1.78A1.48 1.48 0 0 1 19.5 13.5m-5.25-9h1.5V6a.75.75 0 1 0 1.5 0V4.5h1.5a.75.75 0 1 0 0-1.5h-1.5V1.5a.75.75 0 1 0-1.5 0V3h-1.5a.75.75 0 1 0 0 1.5m8.25 3h-.75v-.75a.75.75 0 1 0-1.5 0v.75h-.75a.75.75 0 1 0 0 1.5h.75v.75a.75.75 0 1 0 1.5 0V9h.75a.75.75 0 1 0 0-1.5"
    />
    <defs>
      <linearGradient
        id="aiSparkleGradientFilled"
        x1="12.37"
        x2="12.37"
        y1=".75"
        y2="22.5"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#d14671" />
        <stop offset="1" stopColor="#892c6c" />
      </linearGradient>
    </defs>
  </svg>
)

const HollowSparkle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" fill="none">
    <path
      fill="#d14671"
      d="m11.69 7.582-3.118-1.15-1.152-3.12a1.245 1.245 0 0 0-2.336 0l-1.15 3.12-3.12 1.15a1.245 1.245 0 0 0 0 2.336l3.118 1.15 1.152 3.12a1.245 1.245 0 0 0 2.336 0l1.15-3.118 3.12-1.152a1.245 1.245 0 0 0 0-2.336M7.727 9.779a.75.75 0 0 0-.444.445l-1.032 2.794-1.03-2.794a.75.75 0 0 0-.444-.445L1.984 8.75l2.794-1.03a.75.75 0 0 0 .444-.444l1.03-2.793 1.03 2.793a.75.75 0 0 0 .444.445l2.793 1.029zm.274-7.529a.75.75 0 0 1 .75-.75h.75V.75a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 1 1 0 1.5h-.75v.75a.75.75 0 1 1-1.5 0V3h-.75a.75.75 0 0 1-.75-.75m7 3a.75.75 0 0 1-.75.75h-.25v.25a.75.75 0 1 1-1.5 0V6h-.25a.75.75 0 1 1 0-1.5h.25v-.25a.75.75 0 1 1 1.5 0v.25h.25a.75.75 0 0 1 .75.75"
    />
  </svg>
)

export const AISparkle = ({
  size = 20,
  variant = "filled",
  className,
  inverted = false,
}: AISparkleProps) => (
  <Wrapper $size={size} $inverted={inverted} className={className}>
    {variant === "filled" ? <FilledSparkle /> : <HollowSparkle />}
  </Wrapper>
)
