import React from "react"

type Props = {
  size?: number | string
  color?: string
}

export const PlayFilled = ({ size = 24, color = "currentColor" }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6 2v20l16-10z" />
  </svg>
) 