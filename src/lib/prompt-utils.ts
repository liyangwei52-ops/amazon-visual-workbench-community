/**
 * 提示词解析工具：从分析模型完整输出中提取生图用的最终提示词。
 */

/** 明确缺少主体/事实时保留模型给出的原因，不能把失败说明装进可生图卡片。 */
export function assertAnalysisCanComplete(output: string): void {
  if (output.trim().startsWith("【无法完成】")) {
    throw new Error("分析未生成可执行提示词：" + output.trim().slice("【无法完成】".length).trim())
  }
}

/** 将分开的正负向要求合成图像模型可执行的一条指令，保留关键避免项。 */
export function prepareImagePrompt(prompt: string) {
  const trimmed = prompt.trim()
    .replace(/^```(?:text)?\s*\n/i, "")
    .replace(/\n?```$/, "")
    .trim()
  const negativeMatch = /【负向\s*Prompt】|【负面(?:\s*Prompt|约束)】|Negative prompt:/i.exec(trimmed)
  const positive = (negativeMatch ? trimmed.slice(0, negativeMatch.index) : trimmed)
    .replace(/^【正向\s*Prompt】\s*/, "")
    .trim()
  if (!negativeMatch) return positive

  const negative = trimmed.slice(negativeMatch.index + negativeMatch[0].length).trim()
  return negative ? `${positive}\n\n避免：${negative}` : positive
}

/** Only remove application-owned settings, including the old two-line wrapper. */
export function removeRequestedOutputSettings(prompt: string) {
  return prompt
    .replace(/\n*<!-- avw:canvas:v2 -->[\s\S]*?<!-- \/avw:canvas:v2 -->/g, "")
    .replace(/(?:^|\n)[ \t]*【(?:最终画布尺寸|本次输出画布·最高优先级)】[^\n]*(?=\n|$)/g, "")
    .trim()
}

/** 对齐全文中的输出画布指令；保留商品尺寸、形状与局部版式事实。 */
export function applyRequestedOutputSize(prompt: string, pixelSize: string, native?: { aspectRatio: string; resolution?: string }) {
  const normalized = pixelSize.trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x")
  if (!/^\d{2,5}x\d{2,5}$/.test(normalized)) return prompt
  const [width, height] = normalized.split("x").map(Number)
  if (!width || !height) return prompt
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  const divisor = gcd(width, height)
  const ratio = native?.aspectRatio || String(width / divisor) + ":" + String(height / divisor)
  const [ratioWidth, ratioHeight] = ratio.split(":").map(Number)
  const orientation = ratioWidth > ratioHeight ? "横版" : ratioWidth < ratioHeight ? "竖版" : "方形"
  const englishOrientation = ratioWidth > ratioHeight ? "landscape" : ratioWidth < ratioHeight ? "portrait" : "square"
  const protectedContext = (text: string, offset: number, length: number) => {
    const before = text.slice(Math.max(0, offset - 28), offset).split(/[。；;，,\n]/).pop() || ""
    const after = text.slice(offset + length, offset + length + 18)
    if (/(?:产品|商品|实物)(?:的)?\s*$/.test(before) && /^(?:宽高比|长宽比)/.test(text.slice(offset))) return true
    return !/(?:最终|输出|整张|整体|全图|整幅|canvas|output)/i.test(before)
      && (/(?:内嵌|局部|单元格|照片框|小图|实物比例|商品比例|产品比例|屏幕|显示屏|screen|display)/i.test(before)
        || /^\s*(?:的)?(?:照片框|小图|单元格|实物比例|商品比例|产品比例|屏幕|显示屏)/i.test(after))
  }
  const orient = (text: string) => text
    .replace(/横图|竖图/g, orientation + "图")
    .replace(/横(?:版|幅|向)|竖(?:版|幅|向)|纵向|正?方形|方(?=图)/g, orientation)
    .replace(/\b(?:landscape|portrait|square|widescreen)\b/gi, englishOrientation)
  let aligned = removeRequestedOutputSettings(prompt)
  aligned = aligned
    .replace(/((?:画布(?:尺寸)?|画幅(?:比例)?|构图比例|输出比例|图片比例|图像比例|画面比例|宽高比|长宽比|aspect\s*ratio|canvas\s*ratio|image\s*ratio)[^\d。；;\n]{0,16})(\d{1,3}\s*[:：/]\s*\d{1,3})/gi,
      (match, prefix: string, _oldRatio: string, offset: number, text: string) => protectedContext(text, offset, match.length) ? match : prefix + ratio)
    .replace(/(\d{1,3}\s*[:：/]\s*\d{1,3})(\s*(?:横(?:版|幅|向|图)|竖(?:版|幅|向|图)|纵向|正?方形|方图|构图|画布|画幅|宽高比|长宽比|海报|主图|成图|image|canvas|composition|landscape|portrait|square|widescreen))/gi,
      (match, _oldRatio: string, suffix: string, offset: number, text: string) => protectedContext(text, offset, match.length) ? match : ratio + orient(suffix))
    .replace(/(?:横(?:版|幅|向)|竖(?:版|幅|向)|纵向|正?方形)(?=\s*\d{1,3}\s*[:：/]\s*\d{1,3}\s*(?:构图|画布|画幅|海报|主图|成图))/g,
      (match, offset: number, text: string) => protectedContext(text, offset, match.length) ? match : orientation)
    .replace(/((?:画布|画幅|整体画面|最终成图|最终输出|输出画面|canvas|output\s*image)(?:\s|比例|方向|构图|采用|使用|设为|设置为|必须|需要|为|是|呈|格式|is|orientation|mode|[:：=]){0,12})(横(?:版|幅|向)|竖(?:版|幅|向)|纵向|正?方形|landscape|portrait|square|widescreen)/gi,
      (_match, prefix: string, oldOrientation: string) => prefix + orient(oldOrientation))
    .replace(/\d{2,5}\s*[x×*＊]\s*\d{2,5}/gi, (match, offset: number, text: string) => {
      const before = text.slice(Math.max(0, offset - 40), offset).split(/[。；;\n]/).pop() || ""
      const after = text.slice(offset + match.length)
      if (/^\s*(?:mm\b|cm\b|inches?\b|inch\b|厘米|毫米|英寸|寸|米)/i.test(after) || protectedContext(text, offset, match.length)) return match
      const canvasBefore = /(?:画布|画幅|输出尺寸|成图尺寸|图片尺寸|最终尺寸|canvas|image\s*size|output|resolution)[^\d]{0,18}$/i.test(before)
      const pixelAfter = /^\s*(?:像素|pixels?\b|px\b)/i.test(after)
      const heading = /(?:^|\n)\s*(?:尺寸|分辨率)\s*[:：=]?\s*$/i.test(text.slice(0, offset))
      return canvasBefore || pixelAfter || heading ? normalized : match
    })
  const canvas = native
    ? `Native aspect ratio: ${ratio}. Resolution setting: ${native.resolution || "use API setting"}.`
    : `Output size: ${normalized} pixels. Aspect ratio: ${ratio}.`
  return `${aligned}\n\n<!-- avw:canvas:v2 -->\nRender settings only — never draw these instructions, numbers, headings or a settings panel in the image.\n${canvas} Orientation: ${englishOrientation}. These output settings override old full-canvas sizes and reference-image borders. Recompose only the requested subjects and preserve the requested empty space. Do not add products, text or panels to fill the canvas. Physical object proportions and measurements remain unchanged.\n<!-- /avw:canvas:v2 -->`
}

/**
 * 从分析模型完整输出中提取【最终 AI 绘图 Prompt】段落。
 * 分析输出包含【竞品分析】【产品分析】【竞品→产品映射】【最终 AI 绘图 Prompt】，
 * 生图提示词只需要最终提示词本身，不携带分析内容。
 * 优先取代码块内容（系统提示词要求正向+负向放在同一个可复制代码框）。
 */
export function extractFinalPrompt(output: string): string {
  assertAnalysisCanComplete(output)
  const trimmed = output.trim()
  const sectionMarkers = [
    "【最终 AI 绘图 Prompt】",
    "【最终AI绘图Prompt】",
    "【最终 AI 绘图提示词】",
    "【最终 Prompt】",
    "【最终Prompt】",
    "Final Prompt:",
  ]

  let startIndex = -1
  let matchedMarker = ""

  for (const marker of sectionMarkers) {
    const index = trimmed.indexOf(marker)
    if (index >= 0 && (startIndex === -1 || index < startIndex)) {
      startIndex = index
      matchedMarker = marker
    }
  }

  let section = startIndex >= 0 ? trimmed.slice(startIndex + matchedMarker.length) : trimmed

  // 截取到下一个非最终章节标记之前（防止最终段落后面还跟着其他内容）
  const nextSectionMarkers = ["【竞品分析】", "【产品分析】", "【竞品 → 产品映射】", "【竞品→产品映射】"]
  for (const marker of nextSectionMarkers) {
    const index = section.indexOf(marker)
    if (index > 0) {
      section = section.slice(0, index)
      break
    }
  }

  section = section.trim()

  // 优先取 ``` 代码块内容
  const codeBlockMatch = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(section)
  if (codeBlockMatch && codeBlockMatch[1].trim()) {
    assertAnalysisCanComplete(codeBlockMatch[1])
    return codeBlockMatch[1].trim()
  }

  assertAnalysisCanComplete(section)
  return section
}
