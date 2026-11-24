// What a notebook variable may be called: a letter (any script) or _, then
// letters, digits or _. Shared by the variables editor, interactions and the
// import and agent checks.
const NAME_RE = /^[a-zA-Z\u0080-\uFFFF_][a-zA-Z0-9\u0080-\uFFFF_]*$/

export const isValidVariableName = (name: string): boolean => NAME_RE.test(name)

// QuestDB reads variable names without regard to case: @Sym and @sym are one
// variable, so the console treats them as one name too.
export const sameVariableName = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase()
