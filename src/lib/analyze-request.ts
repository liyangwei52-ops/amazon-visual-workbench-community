import { MAX_ANALYZE_IMAGES, MAX_ANALYZE_IMAGE_URL_BYTES, MAX_ANALYZE_REQUEST_BYTES } from "@/lib/analyze-limits"

type AnalyzeImage = { dataUrl: string; role: string; index: number }
type AnalyzeRequest = {
  endpoint: string
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  images: AnalyzeImage[]
}

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength
const imageBytes = (images: AnalyzeImage[]) => images.reduce((total, image) => total + image.dataUrl.length, 0)

/** Keep small inputs unchanged; give the product twice the reference-image budget. */
function allocateImageBudgets(images: AnalyzeImage[], available: number): number[] {
  const weighted = images.map((image, index) => ({ index, bytes: image.dataUrl.length, weight: image.role === "product" ? 2 : 1 }))
    .sort((a, b) => a.bytes / a.weight - b.bytes / b.weight)
  const budgets = new Array<number>(images.length)
  let remaining = available
  let weight = weighted.reduce((total, image) => total + image.weight, 0)
  for (const image of weighted) {
    const budget = Math.floor(remaining * image.weight / weight)
    budgets[image.index] = Math.min(image.bytes, budget)
    remaining -= budgets[image.index]
    weight -= image.weight
  }
  return budgets
}

async function analysisCopy(image: AnalyzeImage, budget: number): Promise<string> {
  const blob = await (await fetch(image.dataUrl)).blob()
  const bitmap = await createImageBitmap(blob).catch(() => null)
  if (!bitmap) throw new Error(`第 ${image.index} 张图片无法读取，请重新上传 PNG、JPG 或 WEBP 图片。`)
  const canvas = document.createElement("canvas")
  try {
    const context = canvas.getContext("2d")
    if (!context) throw new Error("浏览器无法处理图片，请换用 Chrome 或 Edge 后重试。")
    const originalEdge = Math.max(bitmap.width, bitmap.height)
    const minimumEdge = Math.min(originalEdge, image.role === "product" ? 640 : 384)
    let edge = Math.min(originalEdge, image.role === "product" ? 1600 : 1280)
    let quality = 0.9
    let best = image.dataUrl
    for (let attempt = 0; attempt < 9; attempt++) {
      const scale = edge / originalEdge
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      // Analysis copies use a neutral white background. Uploaded originals stay intact.
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality))
      if (!jpeg) throw new Error(`第 ${image.index} 张图片处理失败，请重新上传。`)
      const candidate = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error("图片处理失败，请重新上传。"))
        reader.readAsDataURL(jpeg)
      })
      if (candidate.length < best.length) best = candidate
      if (best.length <= budget) return best
      const nextEdge = Math.max(minimumEdge, Math.floor(edge * Math.min(0.88, Math.sqrt(budget / candidate.length) * 0.95)))
      const nextQuality = Math.max(0.66, quality - 0.04)
      if (nextEdge === edge && nextQuality === quality) break
      edge = nextEdge
      quality = nextQuality
    }
    throw new Error(`第 ${image.index} 张图片自动处理后仍过大。请降低原图分辨率，或将较多参考图拆成几批分析；本次不会遗漏图片后继续提交。`)
  } finally {
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
  }
}

/** Build one complete request, preserving every image, its identity, and all prompt text. */
export async function buildAnalyzeRequestBody(input: AnalyzeRequest): Promise<string> {
  if (input.images.length > MAX_ANALYZE_IMAGES) throw new Error(`一次分析最多支持 ${MAX_ANALYZE_IMAGES} 张图片，请拆分后提交。`)
  const original = JSON.stringify(input)
  if (byteLength(original) <= MAX_ANALYZE_REQUEST_BYTES && imageBytes(input.images) <= MAX_ANALYZE_IMAGE_URL_BYTES) return original

  // Count UTF-8 text, JSON fields and credentials, rather than estimating only image size.
  const overhead = byteLength(JSON.stringify({ ...input, images: input.images.map(image => ({ ...image, dataUrl: "" })) }))
  const available = Math.min(MAX_ANALYZE_IMAGE_URL_BYTES, MAX_ANALYZE_REQUEST_BYTES - overhead - 16 * 1024)
  if (available <= 0) throw new Error("产品信息和提示词文本超过请求容量，请分批分析；系统不会自动删减文字。")
  const budgets = allocateImageBudgets(input.images, available)
  const images: AnalyzeImage[] = []
  // Process sequentially to avoid decoding many large canvases in memory at once.
  for (const [index, image] of input.images.entries()) {
    images.push({ ...image, dataUrl: image.dataUrl.length <= budgets[index] ? image.dataUrl : await analysisCopy(image, budgets[index]) })
  }
  const body = JSON.stringify({ ...input, images })
  if (byteLength(body) > MAX_ANALYZE_REQUEST_BYTES || imageBytes(images) > MAX_ANALYZE_IMAGE_URL_BYTES) {
    throw new Error("图片自动处理后仍超过分析容量，请将参考图分批分析。本次未提交，全部图片和提示词均已保留。")
  }
  return body
}
