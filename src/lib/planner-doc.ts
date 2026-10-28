import JSZip from "jszip"

export type PlannerDocInfo = {
  fileName: string
  /** 文档中提取到的文案（表格按行拼接） */
  text: string
  /** 文档内嵌图片（竞品参考图，dataUrl，已压缩） */
  images: { name: string; dataUrl: string; source?: string }[]
  /** 未解析到的图片（超接口数量上限或格式不支持）数 */
  droppedImages: number
  type: "docx" | "xlsx" | "csv" | "txt" | "unsupported"
}

// /api/analyze only accepts these image formats. Skip GIFs in documents so an
// otherwise valid plan does not fail when it reaches the analysis endpoint.
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i

/** 按文件名推导 MIME（JSZip 解出的 blob.type 常为空，需显式指定才能通过 /api/analyze 的 data:image/ 校验） */
function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || ""
  switch (ext) {
    case "png": return "image/png"
    case "jpg":
    case "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    default: return "image/png"
  }
}

/** 产品图之外，分析接口最多接收 31 张文档参考图。超限时前端会要求拆分文档。 */
export const MAX_DOC_IMAGES = 31

/** 全部匹配（每次新建正则，避免 lastIndex 污染） */
function matchAll(pattern: RegExp, input: string): RegExpExecArray[] {
  const re = new RegExp(pattern.source, pattern.flags)
  const out: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) out.push(m)
  return out
}

/** XML 实体解码（最小子集） */
function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
}

/** 提取一段 XML 内所有 <t>（或带命名空间前缀 <w:t>）文本 */
function textsIn(xml: string): string {
  return matchAll(/<(?:[a-zA-Z0-9]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?t>/g, xml)
    .map((t) => decodeXml(t[1]))
    .join("")
}

/** Blob → dataURL（浏览器 / Node 双环境兼容，MIME 显式指定） */
async function blobToDataUrl(blob: Blob, mime: string): Promise<string> {
  const buf = await blob.arrayBuffer()
  if (typeof Buffer !== "undefined") {
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`
  }
  const bytes = new Uint8Array(buf)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(bin)}`
}

/** 文档参考图只供分析；转为适中尺寸 JPEG，让全部图片更容易进入请求体。 */
async function referenceToDataUrl(file: File): Promise<string> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return blobToDataUrl(file, file.type)
  }
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return blobToDataUrl(file, file.type)

  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    return blobToDataUrl(file, file.type)
  }
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
  return jpeg ? blobToDataUrl(jpeg, "image/jpeg") : blobToDataUrl(file, file.type)
}

/** 按文件内图片编号顺序提取，不能跳过中间版位的参考图。 */
async function extractZipImages(
  zip: JSZip,
  mediaPrefix: string,
  imageSources: Map<string, string> = new Map()
): Promise<{ images: { name: string; dataUrl: string; source?: string }[]; dropped: number }> {
  const mediaEntries = Object.values(zip.files).filter((entry) => {
    if (entry.dir) return false
    const name = entry.name.toLowerCase()
    return name.startsWith(mediaPrefix) && /\.(png|jpe?g|gif|webp)$/i.test(name)
  })
  const entries = mediaEntries.filter((entry) => IMAGE_EXT_RE.test(entry.name))
  entries.sort((a, b) => {
    const aNumber = Number(/(\d+)(?=\.[^.]+$)/.exec(a.name)?.[1] || 0)
    const bNumber = Number(/(\d+)(?=\.[^.]+$)/.exec(b.name)?.[1] || 0)
    return aNumber - bNumber || a.name.localeCompare(b.name)
  })
  const selected = entries.slice(0, MAX_DOC_IMAGES)

  const images: { name: string; dataUrl: string; source?: string }[] = []
  let dropped = mediaEntries.length - selected.length
  for (const entry of selected) {
    try {
      const blob = await entry.async("blob")
      const mime = mimeFromName(entry.name)
      const file = new File([blob], entry.name.split("/").pop() || "image.png", { type: mime })
      const dataUrl = await referenceToDataUrl(file)
      images.push({ name: file.name, dataUrl, source: imageSources.get(file.name) })
    } catch {
      dropped++
    }
  }
  return { images, dropped }
}

/** 从 Excel drawing 锚点读取每张图片所在行，供模型关联版位文字与参考图。 */
async function extractXlsxImageSources(zip: JSZip, sheetNames: string[]): Promise<Map<string, string>> {
  const sources = new Map<string, string>()
  for (const sheetName of sheetNames) {
    const sheetNumber = sheetName.match(/sheet(\d+)\.xml$/)?.[1]
    if (!sheetNumber) continue
    const sheetXml = await zip.file(sheetName)?.async("string")
    const drawingRelationId = /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheetXml || "")?.[1]
    if (!drawingRelationId) continue
    const sheetRels = await zip.file(`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`)?.async("string")
    const drawingTarget = matchAll(/<Relationship\b[^>]*\/>/g, sheetRels || "")
      .map((match) => match[0])
      .find((relation) => new RegExp(`\\bId="${drawingRelationId}"`).test(relation))
      ?.match(/\bTarget="[^"]*\/([^/"]+\.xml)"/)?.[1]
    if (!drawingTarget) continue
    const drawingXml = await zip.file(`xl/drawings/${drawingTarget}`)?.async("string")
    const drawingRels = await zip.file(`xl/drawings/_rels/${drawingTarget}.rels`)?.async("string")
    if (!drawingXml || !drawingRels) continue

    const mediaByRelation = new Map<string, string>()
    for (const relation of matchAll(/<Relationship\b[^>]*\/>/g, drawingRels)) {
      const id = /\bId="([^"]+)"/.exec(relation[0])?.[1]
      const media = /\bTarget="[^"]*\/([^/"]+\.(?:png|jpe?g|webp))"/i.exec(relation[0])?.[1]
      if (id && media) mediaByRelation.set(id, media)
    }
    for (const anchor of matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor)\b[^>]*>[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g, drawingXml)) {
      const row = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(anchor[0])?.[1]
      const relationId = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(anchor[0])?.[1]
      const media = relationId && mediaByRelation.get(relationId)
      if (row && media) sources.set(media, `工作表 ${sheetNumber} 第 ${Number(row) + 1} 行`)
    }
  }
  return sources
}

/** 解析 .docx：word/document.xml 提取段落文本 + word/media 提取图片 */
export async function extractDocxInfo(file: File): Promise<PlannerDocInfo> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  let text = ""
  const docXml = await zip.file("word/document.xml")?.async("string")
  if (docXml) {
    const paras = matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, docXml)
      .map((p) => textsIn(p[0]))
      .map((t) => t.trim())
      .filter(Boolean)
    text = paras.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  }
  const { images, dropped } = await extractZipImages(zip, "word/media/")
  return { fileName: file.name, text, images, droppedImages: dropped, type: "docx" }
}

/** 解析 .xlsx：sharedStrings + 工作表单元格（按行拼接） + xl/media 提取图片 */
export async function extractXlsxInfo(file: File): Promise<PlannerDocInfo> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  // 1) sharedStrings
  const shared: string[] = []
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string")
  if (sharedXml) {
    shared.push(
      ...matchAll(/<si>[\s\S]*?<\/si>/g, sharedXml).map((si) => textsIn(si[0]))
    )
  }

  // 2) 工作表：按行输出单元格文本
  const lines: string[] = []
  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)/)?.[1] || 0) - Number(b.match(/sheet(\d+)/)?.[1] || 0))

  for (const sheetName of sheetNames) {
    const xml = await zip.file(sheetName)?.async("string")
    if (!xml) continue
    const rows = matchAll(/<row(?:\s[^>]*)?>[\s\S]*?<\/row>/g, xml)
    const sheetLines: string[] = []
    for (const rowMatch of rows) {
      const cells: { col: string; value: string }[] = []
      const cellMatches = matchAll(/<c(?:\s[^>]*)?>[\s\S]*?<\/c>/g, rowMatch[0])
      for (let c = 0; c < cellMatches.length; c++) {
        const cellXml = cellMatches[c][0]
        const ref = /r="([A-Z]+)\d+"/.exec(cellXml)?.[1] || String.fromCharCode(65 + c)
        const type = /t="([^"]+)"/.exec(cellXml)?.[1] || "n"
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(cellXml)
        let value = ""
        if (type === "s" && vMatch && shared[Number(decodeXml(vMatch[1]))] !== undefined) {
          value = shared[Number(decodeXml(vMatch[1]))]
        } else if (type === "inlineStr") {
          value = textsIn(cellXml)
        } else if (vMatch) {
          value = decodeXml(vMatch[1])
        }
        if (value.trim()) cells.push({ col: ref, value: value.trim() })
      }
      if (cells.length) {
        const rowNumber = /<row\b[^>]*\br="(\d+)"/.exec(rowMatch[0])?.[1]
        sheetLines.push(`${rowNumber ? `第 ${rowNumber} 行 ` : ""}${cells.map((cell) => `${cell.col}: ${cell.value}`).join(" | ")}`)
      }
    }
    if (sheetLines.length) {
      lines.push(`【工作表 ${sheetName.match(/sheet(\d+)/)?.[1]}】`, ...sheetLines)
    }
  }

  const text = lines.join("\n").trim()
  const imageSources = await extractXlsxImageSources(zip, sheetNames)
  const { images, dropped } = await extractZipImages(zip, "xl/media/", imageSources)
  return { fileName: file.name, text, images, droppedImages: dropped, type: "xlsx" }
}

/** 解析 .csv/.txt（UTF-8 文本按行拆） */
export async function extractCsvInfo(file: File): Promise<PlannerDocInfo> {
  const raw = await file.text()
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return { fileName: file.name, text: lines.join("\n"), images: [], droppedImages: 0, type: "csv" }
}

export type PlanDocAttachment = {
  fileName: string
  /** 原始文件大小（字节） */
  size: number
  /** 文档 MIME（按扩展名推导，保证 /api/analyze 校验通过） */
  mime: string
  /**
   * 附件地址：
   * - 本地小文档：dataUrl（data:application/...;base64,... 或 data:text/...）
   * - 大文档（>3.5MB，Vercel 线上会 413）：Blob 存储 public URL（https://...），由客户端直传后返回
   */
  dataUrl: string
  /** 是否已直传 Vercel Blob 存储（remote=true 时 dataUrl 为 https URL） */
  remote?: boolean
  type: "docx" | "xlsx" | "csv" | "txt" | "unsupported"
}

/** 按文件名推导文档 MIME */
function docMimeFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (lower.endsWith(".csv")) return "text/csv"
  if (lower.endsWith(".txt")) return "text/plain"
  return "application/octet-stream"
}

/**
 * 把策划文档作为【原始文件】直接附加给模型（图2+），不做任何内容解析。
 * 模型自行读取文档中的文案、表格与内嵌竞品图；不依赖本端解析能力。
 */
export async function docToAttachment(file: File): Promise<PlanDocAttachment> {
  const lower = file.name.toLowerCase()
  let type: PlanDocAttachment["type"] = "unsupported"
  if (/(\.docx|\.xlsx|\.csv|\.txt)$/i.test(lower)) {
    type = lower.endsWith(".xlsx") ? "xlsx" : lower.endsWith(".docx") ? "docx" : lower.endsWith(".csv") ? "csv" : "txt"
  }
  const mime = docMimeFromName(file.name)
  const dataUrl = await blobToDataUrl(file, mime)
  return { fileName: file.name, size: file.size, mime, dataUrl, type }
}

/** 入口：按扩展名分发解析产品策划文档 */
export async function extractPlannerDoc(file: File): Promise<PlannerDocInfo> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".docx")) return extractDocxInfo(file)
  if (lower.endsWith(".xlsx")) return extractXlsxInfo(file)
  if (lower.endsWith(".csv")) return extractCsvInfo(file)
  if (lower.endsWith(".txt")) return extractCsvInfo(file)
  return {
    fileName: file.name,
    text: "",
    images: [],
    droppedImages: 0,
    type: "unsupported",
  }
}
