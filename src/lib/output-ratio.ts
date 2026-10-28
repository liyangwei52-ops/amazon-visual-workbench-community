/** 新自定义项保存宽高比例；customSize字段名保留，用于兼容旧草稿和任务。 */
export function parseOutputRatio(value: string): { width: number; height: number; label: string } | null {
  const match = /^(\d{1,6}(?:\.\d{1,3})?)\s*[:：/]\s*(\d{1,6}(?:\.\d{1,3})?)$/.exec(value.trim())
  if (!match) return null
  const width = Math.round(Number(match[1]) * 1000), height = Math.round(Number(match[2]) * 1000)
  if (width <= 0 || height <= 0) return null
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  const divisor = gcd(width, height)
  return { width: width / divisor, height: height / divisor, label: `${width / divisor}:${height / divisor}` }
}

export function legacyOutputPixels(value: string): [number, number] | null {
  const match = /^(\d{1,6})\s*[x×]\s*(\d{1,6})$/i.exec(value.trim())
  return match && Number(match[1]) > 0 && Number(match[2]) > 0 ? [Number(match[1]), Number(match[2])] : null
}

export function isCustomOutputValid(value: string): boolean {
  return Boolean(parseOutputRatio(value) || legacyOutputPixels(value))
}

export function customRatioLabel(value: string): string {
  const pixels = legacyOutputPixels(value)
  return parseOutputRatio(pixels ? `${pixels[0]}:${pixels[1]}` : value)?.label || value
}

export function ratioPixels(ratio: { width: number; height: number }, quality?: string): [number, number] {
  const edge = quality === "1k" ? 1024 : quality === "4k" ? 4096 : 2048
  const scale = edge / Math.min(ratio.width, ratio.height)
  return [Math.max(1, Math.round(ratio.width * scale)), Math.max(1, Math.round(ratio.height * scale))]
}
