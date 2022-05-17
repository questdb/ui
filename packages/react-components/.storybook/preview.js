import React from "react";
import { ThemeProvider } from "styled-components";

import { theme } from "../src/theme";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  backgrounds: {
    default: "questdb",
    values: [
      { name: "questdb", value: "#282a36" },
      { name: "light", value: "#fff" },
      { name: "dark", value: "#000" },
    ],
  },
};

export const decorators = [
  (Story) => (
    <ThemeProvider theme={theme}>
      <Story />
    </ThemeProvider>
  ),
];

