import { extractGeneratedImages, getImageApiError, type GeneratedImage } from "./image-request"
import { imageFailureOutcome, type ImageFailureOutcome } from "./image-failure"
import { type ImagePlan, promptForImagePlan } from "./model-image-plan"
import { imageIdentityDescription, parseProductImageCount } from "./image-identities"

export class GeminiImageError extends Error {
  constructor(message: string, public status: number, public outcome: ImageFailureOutcome) { super(message) }
}

export function extractGeminiImages(payload: unknown): GeneratedImage[] {
  if (!payload || typeof payload !== "object") return []
  const body = payload as { candidates?: { content?: { parts?: { thought?: boolean; inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }[] } }[] }
  const images = (body.candidates || []).flatMap(candidate => (candidate.content?.parts || []).flatMap(part => {
    if (part.thought) return []
    const data = part.inlineData?.data || part.inline_data?.data
    const mime = part.inlineData?.mimeType || part.inline_data?.mime_type || "image/png"
    return data && /^image\/(?:png|jpeg|webp)$/.test(mime) ? [{ src: `data:${mime};base64,${data}` }] : []
  }))
  return images.length ? images : extractGeneratedImages(payload, "png")
}

export async function requestGeminiImages(input: {
  baseURL: string; apiKey: string; plan: ImagePlan; prompt: string; images: File[];
  count: number; fetcher: typeof fetch; signal?: AbortSignal; productImageCount?: number
  promptMode?: "verbatim"
}) {
  if (input.images.length > 14) throw new GeminiImageError("Gemini单次最多接收14张图片，请减少参考图后重试。", 400, "failed")
  const productCount = parseProductImageCount(input.productImageCount, input.images.length)
  const parts: ({ text: string } | { inline_data: { mime_type: string; data: string } })[] = [{ text: promptForImagePlan(input.prompt, input.plan, input.promptMode) }]
  for (const [index, image] of input.images.entries()) {
    const bytes = new Uint8Array(await image.arrayBuffer())
    const chunks: string[] = []
    for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)))
    if (input.promptMode !== "verbatim") parts.push({ text: imageIdentityDescription(index + 1, index === 0 && productCount > 0 ? "product" : index < productCount ? "product-detail" : "reference") })
    parts.push({ inline_data: { mime_type: image.type || "image/png", data: btoa(chunks.join("")) } })
  }
  const body = JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: {
    responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: input.plan.aspectRatio, imageSize: input.plan.resolution },
  } })
  const url = input.baseURL.replace(/\/$/, "").replace(/\/(?:v1|v1beta)$/, "") + `/v1beta/models/${encodeURIComponent(input.plan.model)}:generateContent`
  const images: GeneratedImage[] = []
  const warnings: string[] = []
  const count = Math.min(4, Math.max(1, Math.floor(input.count) || 1))
  // Gemini没有n参数。每张独立请求，不重试；中断时保留此前的成功图，避免整批丢失。
  for (let index = 0; index < count; index++) {
    try {
      const response = await input.fetcher(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` }, body, signal: input.signal })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = (getImageApiError(payload) || `Gemini请求失败（HTTP ${response.status}）`).replaceAll(input.apiKey, "[已隐藏]")
        throw new GeminiImageError(message, response.status, imageFailureOutcome(response.status, message))
      }
      const result = extractGeminiImages(payload)
      if (!result.length) throw new GeminiImageError("Gemini未返回最终图片，请核查服务商结果后再重试。", 502, "interrupted")
      images.push(result[0])
    } catch (error) {
      const failure = error instanceof GeminiImageError ? error : new GeminiImageError("Gemini连接中断，结果尚未确认，请核查服务商记录。", 502, "interrupted")
      if (!images.length) throw failure
      warnings.push(`已保留 ${images.length}/${count} 张；第 ${index + 1} 张：${failure.message} 后续图片未继续提交，也未自动重试。`)
      break
    }
  }
  return { images, warnings, size: input.plan.size, model: input.plan.model, aspectRatio: input.plan.aspectRatio, resolution: input.plan.resolution }
}
