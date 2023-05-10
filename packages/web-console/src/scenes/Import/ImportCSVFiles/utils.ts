export const isSupportedFile = (file: File) =>
  file.name.endsWith(".csv") || file.type === "text/csv"
