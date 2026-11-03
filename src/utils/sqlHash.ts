export const sqlHash = (value: string): string => {
  let h = 5381
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h) ^ value.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}
