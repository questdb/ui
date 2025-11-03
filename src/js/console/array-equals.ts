export function arrayEquals(left: unknown[], right: unknown[]): boolean {
  // if the other array is a falsy value, return
  if (!left || !right) {
    return false
  }

  // compare lengths - can save a lot of time
  if (left.length !== right.length) {
    return false
  }

  for (let i = 0, l = left.length; i < l; i++) {
    // Check if we have nested arrays
    if (Array.isArray(left[i]) && Array.isArray(right[i])) {
      // recurse into the nested arrays
      if (!arrayEquals(left[i] as unknown[], right[i] as unknown[])) {
        return false
      }
    } else if (left[i] !== right[i]) {
      // Warning - two different object instances will never be equal: {x:20} != {x:20}
      return false
    }
  }
  return true
}
