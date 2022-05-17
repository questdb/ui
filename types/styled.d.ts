import "styled-components";

export type ColorShape = {
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

export type FontSizeShape = {
  ms: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  hg: string;
};

export type Color = keyof ColorShape;

export type FontSize = keyof FontSizeShape;

declare module "styled-components" {
  export interface DefaultTheme {
    baseFontSize: string;
    color: ColorShape;
    font: string;
    fontEmoji: string;
    fontMonospace: string;
    fontSize: FontSizeShape;
    navbar: {
      width: string;
    };
    topbar: {
      height: string;
    };
    borderRadius: string;
  }
}
