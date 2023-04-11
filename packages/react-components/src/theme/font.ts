export type Size = "ms" | "xs" | "sm" | "md" | "lg" | "xl" | "hg";

export const size: { [key in Size]: string } = {
  ms: "1rem",
  xs: "1.2rem",
  sm: "1.3rem",
  md: "1.4rem",
  lg: "1.5rem",
  xl: "1.7rem",
  hg: "3rem",
};
