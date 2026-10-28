import { applyRequestedOutputSize, removeRequestedOutputSettings } from "./prompt-utils"
import { parseOutputRatio, ratioPixels } from "./output-ratio"
import { removeImageModelSuffix, withImageModelSuffix } from "./model-prompt-profile"

export type ImagePlan = {
  model: string
  protocol: "openai" | "gemini"
  requestedSize: string
  size: string
  aspectRatio?: string
  resolution?: "1K" | "2K" | "4K"
  adjusted: boolean
  note: string
}

// Google GenerateContent image-generation resolution table; pixels are estimates,
// aspectRatio/imageSize are the actual Gemini request controls.
const GEMINI_PIXELS: Record<string, [number, number]> = {
  "1:1": [1024, 1024], "2:3": [848, 1264], "3:2": [1264, 848],
  "3:4": [896, 1200], "4:3": [1200, 896], "4:5": [928, 1152],
  "5:4": [1152, 928], "9:16": [768, 1376], "16:9": [1376, 768], "21:9": [1584, 672],
}

export function normalizeImageModel(model: string): string {
  const trimmed = model.trim() || "gpt-image-2"
  const alias = trimmed.toLowerCase().replace(/\s+/g, "-")
  if (/^(?:gemini-3-pro-image(?:-preview)?|gpt-image-2)$/.test(alias)) return alias
  return trimmed
}

export function isGeminiImageModel(model: string): boolean {
  return /^gemini-(?:3-pro-image|3\.1-flash-image)(?:-preview)?$/i.test(normalizeImageModel(model))
}

export function parsePixelSize(size: string): [number, number] | null {
  const match = /^(\d{1,6})x(\d{1,6})$/.exec(size.trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x"))
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) return null
  return [Number(match[1]), Number(match[2])]
}

/** OpenLux GPT Image 2: side<=3840, 16px blocks, ratio<=3, 655360..8294400 pixels. */
export function isValidGptImageSize(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= 3840 && height <= 3840
    && width % 16 === 0 && height % 16 === 0
    && Math.max(width, height) <= 3 * Math.min(width, height)
    && width * height >= 655360 && width * height <= 8294400
}

function nearestGptSize(width: number, height: number): [number, number] {
  if (isValidGptImageSize(width, height)) return [width, height]
  let best: [number, number] = [1024, 1024]
  let score = Infinity
  // The height term is convex for a fixed width; check its nearest legal block
  // plus the legal interval boundaries. At most 240 widths, no large pixel scan.
  for (let w = 16; w <= 3840; w += 16) {
    const minimum = Math.ceil(Math.max(w / 3, 655360 / w, 16) / 16) * 16
    const maximum = Math.floor(Math.min(w * 3, 8294400 / w, 3840) / 16) * 16
    if (minimum > maximum) continue
    const idealHeight = Math.exp((Math.log(height) + 0.25 * Math.log(w * height / width)) / 1.25)
    for (const raw of [Math.floor(idealHeight / 16) * 16, Math.ceil(idealHeight / 16) * 16]) {
      const h = Math.max(minimum, Math.min(maximum, raw))
      const dw = Math.log(w / width), dh = Math.log(h / height)
      const candidate = dw * dw + dh * dh + 0.25 * (dw - dh) ** 2
      if (candidate < score) { score = candidate; best = [w, h] }
    }
  }
  return best
}

export function resolveImagePlan(modelInput: string, sizeInput: string, qualityLevel?: string, preferredRatio?: string): ImagePlan {
  const model = normalizeImageModel(modelInput)
  const customRatio = parseOutputRatio(sizeInput)
  const requestedSize = customRatio?.label || sizeInput.trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x")
  const gemini = isGeminiImageModel(model)
  const plan: ImagePlan = { model, protocol: gemini ? "gemini" : "openai", requestedSize, size: requestedSize, adjusted: false, note: "" }
  if (requestedSize === "auto") {
    if (gemini) return { ...plan, resolution: qualityLevel === "2k" ? "2K" : qualityLevel === "4k" ? "4K" : "1K", note: "自动比例，实际尺寸以返回图片为准。" }
    return plan
  }
  const dimensions = customRatio ? ratioPixels(customRatio, qualityLevel) : parsePixelSize(requestedSize)
  if (!dimensions) throw new Error("请填写有效的宽高比例，例如 5:4 或 1:3；两边必须大于0。")
  const [width, height] = dimensions
  if (gemini) {
    const ratios = Object.keys(GEMINI_PIXELS)
    const wantedRatio = customRatio?.label || preferredRatio
    const aspectRatio = wantedRatio && ratios.includes(wantedRatio) ? wantedRatio
      : ratios.reduce((best, ratio) => {
        const distance = (value: string) => { const [w, h] = value.split(":").map(Number); return Math.abs(Math.log((w / h) / (width / height))) }
        return distance(ratio) < distance(best) ? ratio : best
      })
    const resolution: "1K" | "2K" | "4K" = qualityLevel === "4k" ? "4K" : qualityLevel === "2k" ? "2K" : qualityLevel === "1k" ? "1K" : width * height > 8_000_000 ? "4K" : width * height > 2_000_000 ? "2K" : "1K"
    const multiplier = resolution === "4K" ? 4 : resolution === "2K" ? 2 : 1
    const [w, h] = GEMINI_PIXELS[aspectRatio]
    const size = `${w * multiplier}x${h * multiplier}`
    return { ...plan, size, aspectRatio, resolution, adjusted: requestedSize !== size,
      note: `${customRatio && customRatio.label !== aspectRatio ? `当前模型不支持 ${customRatio.label}，已选择最接近的 ${aspectRatio}。` : ""}Gemini采用原生 ${aspectRatio} / ${resolution}，预计 ${size}；最终像素以返回图片为准。` }
  }
  if (/^gpt-image-2(?:$|[-.])/i.test(model)) {
    // 比例输入优先保持形状，再降低像素以满足模型上限；旧像素输入沿用原适配方式。
    const scale = customRatio ? Math.min(1, 3840 / Math.max(width, height), Math.sqrt(8294400 / (width * height))) : 1
    const [w, h] = nearestGptSize(width * scale, height * scale)
    const size = `${w}x${h}`
    return { ...plan, size, adjusted: size !== requestedSize,
      note: customRatio ? `${Math.max(width, height) > 3 * Math.min(width, height) ? "该比例超出当前模型3:1长短边比限制，已就近适配。" : ""}比例 ${customRatio.label} · ${qualityLevel === "1k" ? "1K" : "2K"} → ${size}；按模型限制适配，像素可能随比例降低。`
        : size !== requestedSize ? `已就近适配：${requestedSize} → ${size}；满足16像素对齐、最长边、比例及像素总量限制。` : "" }
  }
  if (Math.min(width, height) < 64 || Math.max(width, height) > 8192) throw new Error("此模型未内置尺寸规则，请先填写64–8192像素范围内的尺寸，或使用服务商支持的规格。")
  return { ...plan, size: `${width}x${height}`, adjusted: Boolean(customRatio), note: "未内置此模型的尺寸规则，将按计算尺寸提交。" }
}

/** 分析和入队提示词也使用生图模型的同一画布计划。 */
export function requestedCanvas(size: string, quality?: string, ratio?: string, model = "gpt-image-2"): string {
  return resolveImagePlan(model, size, quality, ratio).size
}

export function promptForImagePlan(prompt: string, plan: ImagePlan, mode?: "verbatim"): string {
  // Explicit per-task opt-in. Canvas/model settings are still sent as API parameters.
  if (mode === "verbatim") return prompt
  const original = removeRequestedOutputSettings(removeImageModelSuffix(prompt))
  const canvasPrompt = plan.size === "auto" ? original : applyRequestedOutputSize(original, plan.size, plan.protocol === "gemini" && plan.aspectRatio
    ? { aspectRatio: plan.aspectRatio, resolution: plan.resolution } : undefined)
  return withImageModelSuffix(canvasPrompt, plan.model)
}
