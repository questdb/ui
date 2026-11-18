type UUID = ReturnType<Crypto["randomUUID"]>

// crypto.randomUUID exists only in secure contexts, so a console served over
// plain HTTP from a non-localhost address needs this fallback.
const generateUUID = (): UUID => {
  let d = new Date().getTime()
  // Time in microseconds since page load
  let d2 = performance.now() * 1000
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    let r = Math.random() * 16
    if (d > 0) {
      // Use the timestamp until it is used up
      r = (d + r) % 16 | 0
      d = Math.floor(d / 16)
    } else {
      // Then the microseconds since page load
      r = (d2 + r) % 16 | 0
      d2 = Math.floor(d2 / 16)
    }
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  }) as UUID
}

if (typeof window.crypto.randomUUID !== "function") {
  window.crypto.randomUUID = generateUUID
}

export {}
