import { css } from "styled-components"
import type { ColorShape } from "../../types"

type Color = keyof ColorShape

const getColor =
  <T extends { color: ColorShape }>(color: Color) =>
  (props?: { theme: T }) =>
    props ? props.theme.color[color] : "inherit"

export const buttonVariants = [
  "primary",
  "secondary",
  "tertiary",
  "ghost",
  "danger",
  "dangerGhost",
  "success",
  "warning",
  "gradient",
] as const

export type ButtonVariant = (typeof buttonVariants)[number]

const themes: {
  [key in ButtonVariant]: {
    [key in "normal" | "hover" | "disabled"]: {
      background: Color
      border: Color
      color: Color
    }
  }
} = {
  primary: {
    normal: {
      background: "actionPrimary",
      border: "actionPrimary",
      color: "contentInverse",
    },
    hover: {
      background: "actionPrimaryHover",
      border: "actionPrimaryHover",
      color: "contentInverse",
    },
    disabled: {
      background: "surfaceRaised",
      border: "borderSubtle",
      color: "contentDisabled",
    },
  },
  secondary: {
    normal: {
      background: "controlSurface",
      border: "borderDefault",
      color: "contentPrimary",
    },
    hover: {
      background: "controlSurfaceHover",
      border: "borderStrong",
      color: "contentPrimary",
    },
    disabled: {
      background: "surfaceRaised",
      border: "borderSubtle",
      color: "contentDisabled",
    },
  },
  tertiary: {
    normal: {
      background: "transparent",
      border: "borderStrong",
      color: "contentPrimary",
    },
    hover: {
      background: "interactionNeutralHover",
      border: "contentDisabled",
      color: "contentPrimary",
    },
    disabled: {
      background: "transparent",
      border: "borderDefault",
      color: "contentDisabled",
    },
  },
  ghost: {
    normal: {
      background: "transparent",
      border: "transparent",
      color: "contentSecondary",
    },
    hover: {
      background: "surfaceRaised",
      border: "transparent",
      color: "contentPrimary",
    },
    disabled: {
      background: "transparent",
      border: "transparent",
      color: "contentDisabled",
    },
  },
  success: {
    normal: {
      background: "controlSurface",
      border: "borderDefault",
      color: "statusSuccess",
    },
    hover: {
      background: "controlSurfaceHover",
      border: "borderStrong",
      color: "statusSuccess",
    },
    disabled: {
      background: "surfaceRaised",
      border: "borderSubtle",
      color: "contentDisabled",
    },
  },
  dangerGhost: {
    normal: {
      background: "transparent",
      border: "transparent",
      color: "statusDanger",
    },
    hover: {
      background: "statusDangerSurface",
      border: "transparent",
      color: "statusDanger",
    },
    disabled: {
      background: "transparent",
      border: "transparent",
      color: "contentDisabled",
    },
  },
  danger: {
    normal: {
      background: "statusDangerSurface",
      border: "transparent",
      color: "statusDangerStrong",
    },
    hover: {
      background: "statusDangerSurfaceHover",
      border: "transparent",
      color: "statusDangerStrong",
    },
    disabled: {
      background: "surfaceRaised",
      border: "borderSubtle",
      color: "contentDisabled",
    },
  },
  warning: {
    normal: {
      background: "controlSurface",
      border: "borderDefault",
      color: "statusWarning",
    },
    hover: {
      background: "controlSurfaceHover",
      border: "borderStrong",
      color: "statusWarning",
    },
    disabled: {
      background: "surfaceRaised",
      border: "borderSubtle",
      color: "contentDisabled",
    },
  },
  gradient: {
    normal: {
      background: "surfaceInset",
      border: "transparent",
      color: "contentPrimary",
    },
    hover: {
      background: "surfaceInset",
      border: "transparent",
      color: "contentPrimary",
    },
    disabled: {
      background: "surfaceRaised",
      border: "borderSubtle",
      color: "contentDisabled",
    },
  },
}

export const makeButtonVariant = (variant: ButtonVariant) => {
  const theme = themes[variant] ?? themes.primary

  return css`
    && {
      background: ${getColor(theme.normal.background)};
      color: ${getColor(theme.normal.color)};
      border-color: ${getColor(theme.normal.border)};
    }

    &&:hover:not(:disabled):not([aria-disabled="true"]) {
      background: ${getColor(theme.hover.background)};
      color: ${getColor(theme.hover.color)};
      border-color: ${getColor(theme.hover.border)};
    }

    &&[aria-pressed="true"]:not(:disabled):not([aria-disabled="true"]) {
      background: ${getColor(theme.hover.background)};
      color: ${getColor(theme.hover.color)};
      border-color: ${getColor(theme.hover.border)};
    }

    &&:active:not(:disabled):not([aria-disabled="true"]) {
      background: ${getColor(theme.hover.background)};
      filter: brightness(90%);
    }

    &&:disabled,
    &&[aria-disabled="true"] {
      cursor: not-allowed;
      background: ${getColor(theme.disabled.background)};
      color: ${getColor(theme.disabled.color)};
      border-color: ${getColor(theme.disabled.border)};
    }
  `
}
