type Platform = {
  isMacintosh: boolean
  isWindows: boolean
  isIOS: boolean
  isLinux: boolean
}

export const platform: Platform = {
  isMacintosh: false,
  isWindows: false,
  isIOS: false,
  isLinux: false,
}

if (typeof navigator === "object") {
  platform.isMacintosh = navigator.userAgent.indexOf("Macintosh") !== -1
  platform.isWindows = navigator.userAgent.indexOf("Windows") >= 0
  platform.isIOS =
    (navigator.userAgent.indexOf("Macintosh") >= 0 ||
      navigator.userAgent.indexOf("iPad") >= 0 ||
      navigator.userAgent.indexOf("iPhone") >= 0) &&
    !!navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 0
}
