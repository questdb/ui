import React from "react";

type Level = 1 | 2 | 3 | 4 | 5;

export type Props = {
  level: Level;
  children?: React.ReactNode;
};

const fontSizes: { [key in Level]: string } = {
  1: "3.8rem",
  2: "3rem",
  3: "2.4rem",
  4: "2rem",
  5: "1.6rem",
};

export const Heading = ({ level, children, ...rest }: Props) =>
  React.createElement(
    `h${level}`,
    { style: { fontSize: fontSizes[level], margin: 0 }, ...rest },
    children
  );
