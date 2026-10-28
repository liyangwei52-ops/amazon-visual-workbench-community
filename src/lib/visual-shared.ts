import { imageIdentityDescription } from "./image-identities"
/**
 * 电商视觉工作台 · 共享常量与工具
 * 供四个输入入口、统一生成设置与栏目队列复用。
 */

export const DEFAULT_ENDPOINT = "https://api.openai.com/v1"
export const DEFAULT_ANALYZE_MODEL = "gpt-4o"
export const DEFAULT_IMAGE_MODEL = "gpt-image-2"

export const MAX_REFERENCE_IMAGES = 2
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

export const COMPRESS_MAX_EDGE = 1280
export const COMPRESS_THRESHOLD = 512 * 1024

export const STORAGE_KEYS = {
  analyzeEndpoint: "amazon-workbench.analyzeEndpoint",
  analyzeApiKey: "amazon-workbench.analyzeApiKey",
  analyzeModel: "amazon-workbench.analyzeModel",
  imageEndpoint: "amazon-workbench.imageEndpoint",
  imageApiKey: "amazon-workbench.imageApiKey",
  imageModel: "amazon-workbench.imageModel",
}

export const COUNT_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
]

/**
 * 四入口共用的比例 + 清晰度体系
 * 输出比例只表达宽高比（1:1 / 3:2 / …），清晰度独立选择 1K / 2K，
 * 组合后映射为具体像素尺寸（sizeFromRatioQuality）。
 */

export const RATIO_OPTIONS = [
  { value: "1:1", label: "1:1 · 方形" },
  { value: "3:2", label: "3:2 · 横版" },
  { value: "2:3", label: "2:3 · 竖版" },
  { value: "4:3", label: "4:3 · 横版" },
  { value: "3:4", label: "3:4 · 竖版" },
  { value: "4:5", label: "4:5 · 竖版" },
  { value: "16:9", label: "16:9 · 横版" },
  { value: "9:16", label: "9:16 · 竖版" },
  { value: "21:9", label: "21:9 · 超宽" },
  { value: "custom", label: "自定义比例" },
]

export const QUALITY_LEVEL_OPTIONS = [
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
]

/** 比例 × 清晰度 → 像素预设；两边均为16的倍数，超宽预设保留21:9。 */
const RATIO_TO_SIZES: Record<string, { "1k": string; "2k": string }> = {
  "1:1": { "1k": "1024x1024", "2k": "2048x2048" },
  "3:2": { "1k": "1536x1024", "2k": "3072x2048" },
  "2:3": { "1k": "1024x1536", "2k": "2048x3072" },
  "4:3": { "1k": "1344x1024", "2k": "2688x2048" },
  "3:4": { "1k": "1024x1344", "2k": "2048x2688" },
  "4:5": { "1k": "1024x1280", "2k": "2048x2560" },
  "16:9": { "1k": "1792x1024", "2k": "2048x1152" },
  "9:16": { "1k": "1024x1792", "2k": "1152x2048" },
  "21:9": { "1k": "2464x1056", "2k": "3584x1536" },
}

export type QualityLevel = "1k" | "2k"

export function sizeFromRatioQuality(ratio: string, quality: QualityLevel): string {
  if (ratio === "custom") return "custom"
  const sizes = RATIO_TO_SIZES[ratio]
  if (!sizes) return "1024x1024"
  return sizes[quality]
}

/** 兼容旧数据：旧像素值（如 1024x1024 / 2048x2048 / 2048x1152）归一化为比例 */
export function normalizeRatio(value: string): string {
  if (!value || RATIO_OPTIONS.some((o) => o.value === value)) return value
  if (value === "custom") return "custom"
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) return "1:1"
  const w = Number(match[1])
  const h = Number(match[2])
  const ratio = w / h
  const closest = RATIO_OPTIONS.filter((o) => o.value !== "custom")
    .map((o) => {
      const [wr, hr] = o.value.split(":").map(Number)
      return { value: o.value, diff: Math.abs(wr / hr - ratio) }
    })
    .sort((a, b) => a.diff - b.diff)[0]
  return closest?.value || "1:1"
}

/** 从旧像素值推导清晰度：短边 ≥ 1600 视为 2K，否则 1K */
export function inferQuality(value: string): QualityLevel {
  const match = /^(\d+)x(\d+)$/.exec(value || "")
  if (!match) return "2k"
  const short = Math.min(Number(match[1]), Number(match[2]))
  return short >= 1600 ? "2k" : "1k"
}

/** 第二页「生图全部」→ 跳转专门的生图模块页（/generate）的任务队列键 */
export const GENERATE_QUEUE_KEY = "amazon-workbench.generateQueue"

/** 第二页工作台现场快照：跳转生图模块前保存，返回时自动恢复（避免整页跳转丢状态） */
export const REMIX_DRAFT_KEY = "amazon-workbench.remixDraft"

/** 生成队列执行锁：防止多个页面入口同时执行同一队列 */
export const QUEUE_LOCK_KEY = "amazon-workbench.queueLock"
export const GENERATE_ORIGIN_KEY = "amazon-workbench.generateOrigin"
export const QUEUE_HOLD_KEY = "amazon-workbench.queueHold"

export type GenerateTask = {
  /** 旧队列缺省时读取原全局来源；混合队列各自保留来源与编辑条目身份。 */
  origin?: "/" | "/planner" | "/remix" | "/simple"
  sourceEntryId?: string
  /** 兼容历史追加重绘任务，不自动合并或删除旧记录。 */
  redrawOf?: string
  redrawIndices?: number[]
  /** 原位重绘：只替换成功返回的选中图号，失败/待确认仍保留旧图。 */
  redraw?: { id: string; indices: number[]; pending: number[] }
  /** 每个图号的图片版本，用于资产去重，避免新图命中旧图资产。 */
  resultVersions?: string[]
  /** 输入图片已持久化的批次键，避免每条任务重复占用 localStorage。 */
  inputBatchId?: string
  /** 局部重交可使用新素材批次，但结果仍留在原清单的原位置。旧任务回退 inputBatchId。 */
  generationBatchId?: string
  /** 本结果清单对应的全部编辑框ID，含未提交框；不授予任何发送意图。 */
  generationEntryIds?: string[]
  /** 用户停止本轮时尚未发送；仅显式继续/单条重试才重新排队。 */
  stoppedBeforeSend?: boolean
  id: string
  label: string
  ratio: string
  customSize: string
  quality: QualityLevel
  count: number
  prompt: string
  /** 新极简任务直传用户原文；缺省保留旧任务与三分析入口的适配行为。 */
  promptMode?: "verbatim"
  productImageDataUrl: string
  /** 产品图按顺序排列：第一张为主产品，其余为补充；缺省时兼容单张旧任务。 */
  productImages?: { dataUrl: string; name?: string }[]
  /** 本次生图实际提交的竞品参考图快照，排在全部产品图之后；重绘沿用，工作台编辑开关不改旧任务。 */
  references?: { dataUrl: string; name?: string }[]
  status: "queued" | "running" | "success" | "failed" | "interrupted"
  resultUrls: string[]
  /** 图片正文移入IndexedDB后保留真实数量，避免将少图任务显示为完整成功。 */
  resultCount?: number
  resultsSaved?: boolean
  resultWarning?: string
  error?: string
  requestInfo?: {
    provider: string
    model: string
    size: string
    startedAt: number
    elapsedMs?: number
    requestedSize?: string
    submittedSize?: string
    aspectRatio?: string
    resolution?: string
  }
  paused?: boolean
}

export type UploadImage = {
  id: string
  name: string
  dataUrl: string
  file: File
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("读取文件失败"))
    reader.readAsDataURL(file)
  })
}

export function validateUpload(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return `不支持的图片格式：${file.name}（仅支持 PNG / JPG / WEBP）`
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `图片超过 10MB：${file.name}`
  }
  return null
}

/**
 * 上传图片自动压缩：减少发送给分析/生图模型的 payload，显著降低上游处理耗时与超时概率。
 * - 小于 512KB 且最长边 ≤1280px 的图片原样使用；
 * - 其余图片缩放到最长边 1280px：PNG 保持透明、其余转 JPEG(0.85)。
 */
export async function compressUploadImage(
  file: File
): Promise<{ file: File; dataUrl: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null)

  if (!bitmap) {
    const dataUrl = await readFileAsDataUrl(file)
    return { file, dataUrl }
  }

  const scale = Math.min(1, COMPRESS_MAX_EDGE / Math.max(bitmap.width, bitmap.height))

  if (file.size <= COMPRESS_THRESHOLD && scale >= 1) {
    bitmap.close()
    const dataUrl = await readFileAsDataUrl(file)
    return { file, dataUrl }
  }

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    const dataUrl = await readFileAsDataUrl(file)
    return { file, dataUrl }
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const keepPng = file.type === "image/png"
  const mime = keepPng ? "image/png" : "image/jpeg"
  const quality = keepPng ? undefined : 0.85

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality)
  )
  if (!blob) {
    const dataUrl = await readFileAsDataUrl(file)
    return { file, dataUrl }
  }

  const extension = keepPng ? ".png" : ".jpg"
  const baseName = file.name.replace(/\.[^.]+$/, "")
  const compressedFile = new File([blob], `${baseName}${extension}`, { type: mime })
  const dataUrl = await readFileAsDataUrl(compressedFile)

  return { file: compressedFile, dataUrl }
}

/** 生图时附带的图片身份说明（图1=我方产品图），保证「改变场景，不改变商品」 */
export function buildImageIdentitySuffix(hasProduct: boolean | number, referenceCount = 0) {
  const count = typeof hasProduct === "number" ? hasProduct : hasProduct ? 1 : 0
  const parts = Array.from({ length: count }, (_, index) => imageIdentityDescription(index + 1, index === 0 ? "product" : "product-detail"))
  for (let index = 0; index < referenceCount; index++) parts.push(imageIdentityDescription(count + index + 1, "reference"))
  return parts.length
    ? `\n\n【图片顺序说明，仅用于识别素材，不绘入画面】${parts.join("；")}。本条需求决定哪些主体出镜；商品保真仅作用于需要展示的对应实物，资料图不强制出镜。`
    : ""
}
