// The value a record holds under a key that comes from outside the console,
// like a model's tool name or an agent's field id. A plain object also
// answers for what every object inherits ("constructor", "toString",
// "__proto__"), so only its own properties count.
export const ownValue = <T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined)
