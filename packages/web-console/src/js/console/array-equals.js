function arrayEquals(left, right) {
  // if the other array is a falsy value, return
  if (!left || !right) {
    return false
  }

  // compare lengths - can save a lot of time
  if (left.length !== right.length) {
    return false
  }

  for (var i = 0, l = left.length; i < l; i++) {
    // Check if we have nested arrays
    if (left[i] instanceof Array && right[i] instanceof Array) {
      // recurse into the nested arrays
      if (!left[i].equals(right[i])) {
        return false
      }
    } else if (left[i] !== right[i]) {
      // Warning - two different object instances will never be equal: {x:20} != {x:20}
      return false
    }
  }
  return true
}

module.exports = {
  arrayEquals,
}
