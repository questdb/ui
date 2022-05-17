import { DefaultTheme } from "styled-components";
import { size as fontSize } from "./font";
import { color } from "./color";

export const theme: DefaultTheme = {
  baseFontSize: "10px",
  color,
  font: '"Open Sans", -apple-system, BlinkMacSystemFont, Helvetica, Roboto, sans-serif',
  fontEmoji:
    '"apple color emoji", "segoe ui emoji", "android emoji", "emojisymbols", "emojione mozilla", "twemoji mozilla", "segoe ui symbol", "noto color emoji"',
  fontMonospace:
    'SFMono-Regular, Menlo, Monaco, Consolas,"Liberation Mono", "Courier New", monospace',
  fontSize,
  navbar: {
    width: "4.5rem",
  },
  topbar: {
    height: "4.5rem",
  },
  borderRadius: "0.8rem",
};
