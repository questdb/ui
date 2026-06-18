// Prompt-injection guard: `<`→`‹` (U+2039), `>`→`›` (U+203A) so user-controlled
// strings can't forge closing tags. Applied AFTER truncation to keep length bounds.
export const sanitizeForPromptContext = (s: string): string =>
  s.replace(/</g, "‹").replace(/>/g, "›")
