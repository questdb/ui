import { spinAnimation } from "../../../components/Animation"
import React from "react"
import styled from "styled-components"

// Gutter icon state types
export type GutterIconState =
  | "noChat"
  | "noChatHover"
  | "active"
  | "activeHover"
  | "highlight"

// Play icon - green play button
export const PlayIcon = () => (
  <svg
    viewBox="0 0 24 24"
    height="22px"
    width="22px"
    fill="#50fa7b"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M16.394 12 10 7.737v8.526L16.394 12zm2.982.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z" />
  </svg>
)

// Cancel icon - red stop square
export const CancelIcon = () => (
  <svg
    viewBox="0 0 24 24"
    height="22px"
    width="22px"
    fill="#ff5555"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M7 7v10h10V7H7zM6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  </svg>
)

// Loading icon - white spinner (requires animation wrapper)
export const LoadingIconSvg = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="white"
    height="22px"
    width="22px"
  >
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M12 2a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-3a1 1 0 0 1 1-1zm8.66-10a1 1 0 0 1-.366 1.366l-2.598 1.5a1 1 0 1 1-1-1.732l2.598-1.5A1 1 0 0 1 20.66 7zM7.67 14.5a1 1 0 0 1-.366 1.366l-2.598 1.5a1 1 0 1 1-1-1.732l2.598-1.5a1 1 0 0 1 1.366.366zM20.66 17a1 1 0 0 1-1.366.366l-2.598-1.5a1 1 0 0 1 1-1.732l2.598 1.5A1 1 0 0 1 20.66 17zM7.67 9.5a1 1 0 0 1-1.366.366l-2.598-1.5a1 1 0 1 1 1-1.732l2.598 1.5A1 1 0 0 1 7.67 9.5z" />
  </svg>
)

// Error icon - play button with red error badge
export const ErrorIcon = () => (
  <svg
    viewBox="0 0 24 24"
    height="22px"
    width="22px"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <clipPath id="errorClip">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
    <g clipPath="url(#errorClip)">
      <path
        d="M8 4.934v14.132c0 .433.466.702.812.484l10.563-7.066a.5.5 0 0 0 0-.832L8.812 4.616A.5.5 0 0 0 8 4.934Z"
        fill="#50fa7b"
      />
      <circle cx="18" cy="8" r="6" fill="#ff5555" />
      <rect x="17" y="4" width="2" height="5" fill="white" rx="0.5" />
      <circle cx="18" cy="11" r="1" fill="white" />
    </g>
  </svg>
)

// Success icon - play button with green checkmark badge
export const SuccessIcon = () => (
  <svg
    viewBox="0 0 24 24"
    height="22px"
    width="22px"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <clipPath id="successClip">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
    <g clipPath="url(#successClip)">
      <path
        d="M8 4.934v14.132c0 .433.466.702.812.484l10.563-7.066a.5.5 0 0 0 0-.832L8.812 4.616A.5.5 0 0 0 8 4.934Z"
        fill="#50fa7b"
      />
      <circle cx="18" cy="8" r="6" fill="#00aa3b" />
      <path
        d="m15 8.5 2 2 4-4"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
  </svg>
)

// Expand up/down icon for collapsible sections
export const ExpandUpDownIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="9"
    height="16"
    viewBox="0 0 7 12"
    fill="none"
  >
    <path
      d="M3.06 1.88667L5.17333 4L6.11333 3.06L3.06 0L0 3.06L0.946667 4L3.06 1.88667ZM3.06 10.1133L0.946667 8L0.00666682 8.94L3.06 12L6.12 8.94L5.17333 8L3.06 10.1133Z"
      fill="currentColor"
    />
  </svg>
)

const CircleNotch = (
  props: React.SVGProps<SVGSVGElement> & { size?: number },
) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || 24}
    height={props.size || 24}
    viewBox="0 0 24 24"
    fill="none"
    {...(props as React.SVGProps<SVGSVGElement>)}
  >
    <path
      d="M15.75 3.75C17.32 4.48224 18.6482 5.64772 19.5783 7.10926C20.5084 8.57081 21.0016 10.2676 21 12C21 14.3869 20.0518 16.6761 18.364 18.364C16.6761 20.0518 14.387 21 12 21C9.61306 21 7.32387 20.0518 5.63604 18.364C3.94822 16.6761 3 14.3869 3 12C2.99838 10.2676 3.49163 8.57081 4.4217 7.10926C5.35178 5.64772 6.67998 4.48224 8.25 3.75"
      stroke="url(#paint0_linear_140_9487)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient
        id="paint0_linear_140_9487"
        x1="12"
        y1="3.75"
        x2="12"
        y2="21"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#D14671" />
        <stop offset="1" stopColor="#892C6C" />
      </linearGradient>
    </defs>
  </svg>
)

const CircleNotchStyled = styled(CircleNotch)<{ size?: number }>`
  ${spinAnimation};
  flex-shrink: 0;
  transform-origin: center;
`

export const CircleNotchSpinner = (
  props: Omit<React.SVGProps<SVGSVGElement>, "ref"> & { size?: number },
) => <CircleNotchStyled size={props.size} {...props} />

/**
 * Creates an SVG element for use in vanilla DOM (glyph widgets).
 * This is needed because Monaco glyph widgets use DOM elements, not React components.
 */
export const createSvgElement = (
  type:
    | "play"
    | "cancel"
    | "loading"
    | "error"
    | "success"
    | "aiSparkleHollow"
    | "aiSparkleFilled",
  size = 22,
): SVGSVGElement => {
  const svgNS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(svgNS, "svg")

  switch (type) {
    case "play": {
      svg.setAttribute("viewBox", "0 0 24 24")
      svg.setAttribute("height", `${size}px`)
      svg.setAttribute("width", `${size}px`)
      svg.setAttribute("fill", "#50fa7b")
      svg.innerHTML = `
        <path fill="none" d="M0 0h24v24H0z"/>
        <path d="M16.394 12 10 7.737v8.526L16.394 12zm2.982.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z"/>
      `
      break
    }
    case "cancel": {
      svg.setAttribute("viewBox", "0 0 24 24")
      svg.setAttribute("height", `${size}px`)
      svg.setAttribute("width", `${size}px`)
      svg.setAttribute("fill", "#ff5555")
      svg.innerHTML = `
        <path fill="none" d="M0 0h24v24H0z"/>
        <path d="M7 7v10h10V7H7zM6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>
      `
      break
    }
    case "loading": {
      svg.setAttribute("viewBox", "0 0 24 24")
      svg.setAttribute("height", `${size}px`)
      svg.setAttribute("width", `${size}px`)
      svg.setAttribute("fill", "white")
      svg.innerHTML = `
        <path fill="none" d="M0 0h24v24H0z"/>
        <path d="M12 2a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-3a1 1 0 0 1 1-1zm8.66-10a1 1 0 0 1-.366 1.366l-2.598 1.5a1 1 0 1 1-1-1.732l2.598-1.5A1 1 0 0 1 20.66 7zM7.67 14.5a1 1 0 0 1-.366 1.366l-2.598 1.5a1 1 0 1 1-1-1.732l2.598-1.5a1 1 0 0 1 1.366.366zM20.66 17a1 1 0 0 1-1.366.366l-2.598-1.5a1 1 0 0 1 1-1.732l2.598 1.5A1 1 0 0 1 20.66 17zM7.67 9.5a1 1 0 0 1-1.366.366l-2.598-1.5a1 1 0 1 1 1-1.732l2.598 1.5A1 1 0 0 1 7.67 9.5z"/>
      `
      break
    }
    case "error": {
      svg.setAttribute("viewBox", "0 0 24 24")
      svg.setAttribute("height", `${size}px`)
      svg.setAttribute("width", `${size}px`)
      svg.setAttribute("fill", "none")
      svg.innerHTML = `
        <defs>
          <clipPath id="errorClip${Date.now()}">
            <rect width="24" height="24"/>
          </clipPath>
        </defs>
        <g clip-path="url(#errorClip${Date.now()})">
          <path d="M8 4.934v14.132c0 .433.466.702.812.484l10.563-7.066a.5.5 0 0 0 0-.832L8.812 4.616A.5.5 0 0 0 8 4.934Z" fill="#50fa7b"/>
          <circle cx="18" cy="8" r="6" fill="#ff5555"/>
          <rect x="17" y="4" width="2" height="5" fill="white" rx="0.5"/>
          <circle cx="18" cy="11" r="1" fill="white"/>
        </g>
      `
      break
    }
    case "success": {
      svg.setAttribute("viewBox", "0 0 24 24")
      svg.setAttribute("height", `${size}px`)
      svg.setAttribute("width", `${size}px`)
      svg.setAttribute("fill", "none")
      svg.innerHTML = `
        <defs>
          <clipPath id="successClip${Date.now()}">
            <rect width="24" height="24"/>
          </clipPath>
        </defs>
        <g clip-path="url(#successClip${Date.now()})">
          <path d="M8 4.934v14.132c0 .433.466.702.812.484l10.563-7.066a.5.5 0 0 0 0-.832L8.812 4.616A.5.5 0 0 0 8 4.934Z" fill="#50fa7b"/>
          <circle cx="18" cy="8" r="6" fill="#00aa3b"/>
          <path d="m15 8.5 2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </g>
      `
      break
    }
    case "aiSparkleHollow": {
      svg.setAttribute("viewBox", "0 0 15 15")
      svg.setAttribute("height", `${size}px`)
      svg.setAttribute("width", `${size}px`)
      svg.setAttribute("fill", "none")
      svg.innerHTML = `
        <path fill="#d14671" d="m11.69 7.582-3.118-1.15-1.152-3.12a1.245 1.245 0 0 0-2.336 0l-1.15 3.12-3.12 1.15a1.245 1.245 0 0 0 0 2.336l3.118 1.15 1.152 3.12a1.245 1.245 0 0 0 2.336 0l1.15-3.118 3.12-1.152a1.245 1.245 0 0 0 0-2.336M7.727 9.779a.75.75 0 0 0-.444.445l-1.032 2.794-1.03-2.794a.75.75 0 0 0-.444-.445L1.984 8.75l2.794-1.03a.75.75 0 0 0 .444-.444l1.03-2.793 1.03 2.793a.75.75 0 0 0 .444.445l2.793 1.029zm.274-7.529a.75.75 0 0 1 .75-.75h.75V.75a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 1 1 0 1.5h-.75v.75a.75.75 0 1 1-1.5 0V3h-.75a.75.75 0 0 1-.75-.75m7 3a.75.75 0 0 1-.75.75h-.25v.25a.75.75 0 1 1-1.5 0V6h-.25a.75.75 0 1 1 0-1.5h.25v-.25a.75.75 0 1 1 1.5 0v.25h.25a.75.75 0 0 1 .75.75"/>
      `
      break
    }
    case "aiSparkleFilled": {
      const gradientId = `aiSparkleGradient${Date.now()}`
      svg.setAttribute("viewBox", "0 0 24 24")
      svg.setAttribute("height", `${size}px`)
      svg.setAttribute("width", `${size}px`)
      svg.setAttribute("fill", "none")
      svg.innerHTML = `
        <path fill="url(#${gradientId})" d="M19.5 13.5a1.48 1.48 0 0 1-.977 1.4l-4.836 1.787-1.78 4.84a1.493 1.493 0 0 1-2.802 0l-1.793-4.84-4.839-1.78a1.492 1.492 0 0 1 0-2.802l4.84-1.793 1.78-4.839a1.492 1.492 0 0 1 2.802 0l1.792 4.84 4.84 1.78A1.48 1.48 0 0 1 19.5 13.5m-5.25-9h1.5V6a.75.75 0 1 0 1.5 0V4.5h1.5a.75.75 0 1 0 0-1.5h-1.5V1.5a.75.75 0 1 0-1.5 0V3h-1.5a.75.75 0 1 0 0 1.5m8.25 3h-.75v-.75a.75.75 0 1 0-1.5 0v.75h-.75a.75.75 0 1 0 0 1.5h.75v.75a.75.75 0 1 0 1.5 0V9h.75a.75.75 0 1 0 0-1.5"/>
        <defs>
          <linearGradient id="${gradientId}" x1="12.37" x2="12.37" y1=".75" y2="22.5" gradientUnits="userSpaceOnUse">
            <stop stop-color="#d14671"/>
            <stop offset="1" stop-color="#892c6c"/>
          </linearGradient>
        </defs>
      `
      break
    }
  }

  return svg
}

export const createAIGutterIcon = (
  state: GutterIconState,
  size = 16,
): HTMLElement => {
  const wrapper = document.createElement("span")
  wrapper.className = "glyph-ai-icon"

  const wrapperSize = size + 8 // 4px padding on each side
  wrapper.style.display = "inline-flex"
  wrapper.style.alignItems = "center"
  wrapper.style.justifyContent = "center"
  wrapper.style.width = `${wrapperSize}px`
  wrapper.style.height = `${wrapperSize}px`
  wrapper.style.borderRadius = "4px"
  wrapper.style.transition = "all 0.15s ease"
  wrapper.style.boxSizing = "border-box"

  // Apply styles based on state
  applyGutterIconState(wrapper, state, size)

  return wrapper
}

export const applyGutterIconState = (
  wrapper: HTMLElement,
  state: GutterIconState,
  size = 16,
): void => {
  // Determine if we need filled or hollow icon
  const isFilled =
    state === "noChatHover" || state === "activeHover" || state === "highlight"

  // Determine if we need the gradient border
  const hasBorder =
    state === "active" || state === "activeHover" || state === "highlight"

  // Determine if we need the glow effect
  const hasGlow = state === "highlight"

  // Clear existing SVG
  wrapper.innerHTML = ""

  // Create the appropriate SVG
  const svg = createSvgElement(
    isFilled ? "aiSparkleFilled" : "aiSparkleHollow",
    size,
  )
  wrapper.appendChild(svg)

  // Apply border and background styles
  if (hasGlow) {
    // Highlight state: gradient background fill + solid border
    wrapper.style.border = "1px solid #d14671"
    wrapper.style.background =
      "linear-gradient(90deg, rgba(209, 70, 113, 0.24) 0%, rgba(137, 44, 108, 0.24) 100%)"
    wrapper.style.boxShadow = "none"
  } else if (hasBorder) {
    // Active/ActiveHover state: transparent background with gradient border
    wrapper.style.border = "1px solid transparent"
    wrapper.style.background = `
      linear-gradient(#2c2e3d, #2c2e3d) padding-box,
      linear-gradient(90deg, #D14671 0%, #892C6C 100%) border-box
    `
    wrapper.style.boxShadow = "none"
  } else {
    // NoChat/NoChatHover state: no border, no background
    wrapper.style.border = "1px solid transparent"
    wrapper.style.background = "transparent"
    wrapper.style.boxShadow = "none"
  }
}

export const getHoverState = (baseState: GutterIconState): GutterIconState => {
  switch (baseState) {
    case "noChat":
      return "noChatHover"
    case "active":
    case "highlight":
      return "activeHover"
    default:
      return baseState
  }
}

export const getBaseState = (
  hoverState: GutterIconState,
  hasConversation: boolean,
): GutterIconState => {
  if (hoverState === "noChatHover") return "noChat"
  if (hoverState === "activeHover") return hasConversation ? "active" : "noChat"
  return hoverState
}
