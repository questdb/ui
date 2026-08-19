type LiquidLensMapOptions = {
  width: number
  height: number
  radius: number
  verticalStrength?: number
}

const WIDTH_BUCKET_PX = 8
const MAX_CACHE_ENTRIES = 32

const liquidLensMapCache = new Map<string, string>()

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * Creates the normal map consumed by an SVG displacement filter. Red bends
 * pixels horizontally and green bends them vertically; the latter can be
 * reduced for compact controls where vertical movement reads as misalignment.
 *
 * Widths are bucketed because the consuming feImage stretches the map with
 * preserveAspectRatio="none" anyway; without the bucket a continuous resize
 * mints one map per pixel of width, and each miss is a per-pixel loop plus a
 * synchronous PNG encode.
 */
export const createLiquidLensMap = ({
  width,
  height,
  radius,
  verticalStrength = 1,
}: LiquidLensMapOptions) => {
  const mapWidth = Math.max(
    1,
    Math.round(width / WIDTH_BUCKET_PX) * WIDTH_BUCKET_PX,
  )
  const mapHeight = Math.max(1, Math.round(height))
  const cacheKey = `${mapWidth}x${mapHeight}:${radius}:${verticalStrength}`
  const cached = liquidLensMapCache.get(cacheKey)
  if (cached) {
    liquidLensMapCache.delete(cacheKey)
    liquidLensMapCache.set(cacheKey, cached)
    return cached
  }

  const canvas = document.createElement("canvas")
  canvas.width = mapWidth
  canvas.height = mapHeight
  const context = canvas.getContext("2d")
  if (!context) return ""

  const image = context.createImageData(mapWidth, mapHeight)
  const halfWidth = mapWidth / 2
  const halfHeight = mapHeight / 2
  const resolvedRadius = Math.min(radius, halfHeight - 1)
  const feather = 1.5

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const px = x + 0.5 - halfWidth
      const py = y + 0.5 - halfHeight
      const qx = Math.abs(px) - (halfWidth - resolvedRadius)
      const qy = Math.abs(py) - (halfHeight - resolvedRadius)
      const outside =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        resolvedRadius
      const insideAmount = clamp(0.5 - outside / feather, 0, 1)
      const distanceFromRim = Math.max(0, -outside)
      const rim = Math.exp(-distanceFromRim / 5.25)
      const normalizedX = px / Math.max(1, halfWidth)
      const normalizedY = py / Math.max(1, halfHeight)
      const convexBody = 0.12 + 0.12 * (1 - Math.abs(normalizedX))
      const bend = insideAmount * (convexBody + rim * 0.34)
      const horizontalDisplacement = clamp(-normalizedX * bend, -0.47, 0.47)
      const verticalDisplacement =
        clamp(-normalizedY * bend, -0.47, 0.47) * verticalStrength
      const offset = (y * mapWidth + x) * 4

      image.data[offset] = Math.round(128 + horizontalDisplacement * 255)
      image.data[offset + 1] = Math.round(128 + verticalDisplacement * 255)
      image.data[offset + 2] = 128
      image.data[offset + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)
  const dataUrl = canvas.toDataURL("image/png")
  if (liquidLensMapCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = liquidLensMapCache.keys().next().value
    if (oldestKey !== undefined) liquidLensMapCache.delete(oldestKey)
  }
  liquidLensMapCache.set(cacheKey, dataUrl)
  return dataUrl
}
