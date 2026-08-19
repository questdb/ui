type RgbChannels = [number, number, number]

const parseColor = (value: string): RgbChannels | null => {
  const trimmed = value.trim()

  const hex = trimmed.match(/^#([\da-f]{6})$/i)
  if (hex) {
    const packed = parseInt(hex[1], 16)
    return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
  }

  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) {
    return [parseInt(rgb[1], 10), parseInt(rgb[2], 10), parseInt(rgb[3], 10)]
  }

  return null
}

const relativeLuminance = (channels: RgbChannels): number => {
  const [red, green, blue] = channels.map((channel) => {
    const scaled = channel / 255
    return scaled <= 0.03928
      ? scaled / 12.92
      : Math.pow((scaled + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrastRatio = (left: RgbChannels, right: RgbChannels): number => {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right))
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right))
  return (lighter + 0.05) / (darker + 0.05)
}

export const pickReadableTextColor = (
  background: string,
  candidates: string[],
): string => {
  const backgroundChannels = parseColor(background)
  if (!backgroundChannels) return candidates[0]

  return candidates.reduce((best, candidate) => {
    const bestChannels = parseColor(best)
    const candidateChannels = parseColor(candidate)
    if (!bestChannels) return candidate
    if (!candidateChannels) return best
    return contrastRatio(candidateChannels, backgroundChannels) >
      contrastRatio(bestChannels, backgroundChannels)
      ? candidate
      : best
  })
}
