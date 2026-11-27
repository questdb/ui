// Property names that reach an object's prototype. Data read from a file (tab
// import, example dashboards) must never be walked or written through them.
export const DANGEROUS_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
])
