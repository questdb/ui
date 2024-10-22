import { css } from "styled-components";

type ColorShape = {
  black: string;
  black70: string;
  black40: string;
  gray1: string;
  gray2: string;
  backgroundDarker: string;
  background: string;
  foreground: string;
  selection: string;
  comment: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  purple: string;
  cyan: string;
  pink: string;
  pink50: string;
  pinkDarker: string;
  transparent: string;
  white: string;
  inherit: string;
  tooltipBackground: string;
};

type Color = keyof ColorShape;

const getColor =
  <T extends { color: ColorShape }>(color: Color) =>
  (props?: { theme: T }) =>
    props ? props.theme.color[color] : "inherit";

export const skins = [
  "primary",
  "secondary",
  "success",
  "error",
  "warning",
  "transparent",
] as const;

export type Skin = (typeof skins)[number];

const themes: {
  [key in Skin]: {
    [key in "normal" | "hover" | "disabled"]: {
      background: Color;
      border: Color;
      color: Color;
    };
  };
} = {
  primary: {
    normal: {
      background: "pink",
      border: "pink",
      color: "foreground",
    },
    hover: {
      background: "pinkDarker",
      border: "pinkDarker",
      color: "foreground",
    },
    disabled: {
      background: "selection",
      border: "gray1",
      color: "gray1",
    },
  },
  secondary: {
    normal: {
      background: "selection",
      border: "selection",
      color: "foreground",
    },
    hover: {
      background: "comment",
      border: "selection",
      color: "foreground",
    },
    disabled: {
      background: "selection",
      border: "gray1",
      color: "gray1",
    },
  },
  success: {
    normal: {
      background: "selection",
      border: "selection",
      color: "green",
    },
    hover: {
      background: "comment",
      border: "selection",
      color: "green",
    },
    disabled: {
      background: "selection",
      border: "gray1",
      color: "gray1",
    },
  },
  error: {
    normal: {
      background: "selection",
      border: "selection",
      color: "red",
    },
    hover: {
      background: "comment",
      border: "selection",
      color: "red",
    },
    disabled: {
      background: "selection",
      border: "gray1",
      color: "gray1",
    },
  },
  transparent: {
    normal: {
      background: "transparent",
      border: "transparent",
      color: "foreground",
    },
    hover: {
      background: "comment",
      border: "transparent",
      color: "foreground",
    },
    disabled: {
      background: "transparent",
      border: "gray1",
      color: "gray1",
    },
  },
  warning: {
    normal: {
      background: "selection",
      border: "selection",
      color: "orange",
    },
    hover: {
      background: "comment",
      border: "selection",
      color: "orange",
    },
    disabled: {
      background: "selection",
      border: "gray1",
      color: "gray1",
    },
  },
};

export const makeSkin = (skin: Skin) => {
  const theme = themes[skin] ?? themes.primary;

  return css`
    background: ${getColor(theme.normal.background)};
    color: ${getColor(theme.normal.color)};
    border-color: ${getColor(theme.normal.border)};

    &:hover:not([disabled]) {
      background: ${getColor(theme.hover.background)};
      color: ${getColor(theme.hover.color)};
      border-color: ${getColor(theme.hover.border)};
    }

    &:active:not([disabled]) {
      background: ${getColor(theme.hover.background)};
      filter: brightness(90%);
    }

    &:disabled {
      cursor: not-allowed;
      background: ${getColor(theme.disabled.background)};
      color: ${getColor(theme.disabled.color)};
      border-color: ${getColor(theme.disabled.border)};
    }
  `;
};
