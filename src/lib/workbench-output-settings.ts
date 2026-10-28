import { inferQuality, normalizeRatio, RATIO_OPTIONS, sizeFromRatioQuality, type QualityLevel } from "./visual-shared"

/** 保留旧像素预设和自定义尺寸；不能用最近比例迁移来改变用户原来填写的像素。 */
export function restoreWorkbenchOutput(card: { size?: string; customSize?: string; quality?: string }): { size: string; customSize: string; quality: QualityLevel } {
  const size = card.size || "1:1"
  const quality = card.quality === "1k" || card.quality === "2k" ? card.quality : undefined
  if (size === "custom") return { size, customSize: card.customSize || "", quality: quality || "2k" }
  if (RATIO_OPTIONS.some(option => option.value === size)) return { size, customSize: card.customSize || "", quality: quality || "2k" }
  if (/^\d+[x×]\d+$/i.test(size)) {
    const pixels = size.replace("×", "x").toLowerCase()
    const ratio = normalizeRatio(pixels)
    for (const level of ["1k", "2k"] as const) {
      if (sizeFromRatioQuality(ratio, level) === pixels) return { size: ratio, customSize: card.customSize || "", quality: quality || level }
    }
    return { size: "custom", customSize: pixels, quality: quality || inferQuality(pixels) }
  }
  return { size: "1:1", customSize: card.customSize || "", quality: quality || "2k" }
}
