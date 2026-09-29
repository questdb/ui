// Prompt-injection guard: `<`→`‹` (U+2039), `>`→`›` (U+203A) so user-controlled
// strings can't forge closing tags. Applied AFTER truncation to keep length bounds.
export const sanitizeForPromptContext = (s: string): string =>
  s.replace(/</g, "‹").replace(/>/g, "›")

// Same guard for JSON the model copies back verbatim: the escapes are still
// valid JSON, so JSON.parse restores the original characters.
export const stringifyForPromptContext = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
