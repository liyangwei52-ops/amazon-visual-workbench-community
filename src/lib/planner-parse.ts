import { assertAnalysisCanComplete, extractFinalPrompt } from "./prompt-utils"

export type PlannerItem = { title: string; prompt: string }

/** 让生图画幅与策划提示词一致；模型没有写比例时使用图位默认值。 */
export function inferPlannerRatio(title: string, prompt: string): string {
  const supported = new Set(["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "16:9", "9:16", "21:9"])
  const explicit = /(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(prompt)
  if (explicit) {
    const ratio = `${explicit[1]}:${explicit[2]}`
    if (supported.has(ratio)) return ratio
  }

  const pixels = /(\d{3,4})\s*[x×X]\s*(\d{3,4})/.exec(prompt)
  if (pixels) {
    const actual = Number(pixels[1]) / Number(pixels[2])
    return [...supported].map((value) => {
      const [width, height] = value.split(":").map(Number)
      return { value, difference: Math.abs(width / height - actual) }
    }).sort((a, b) => a.difference - b.difference)[0].value
  }

  if (/A\+/.test(title)) return "16:9"
  if (/竖版|纵版/.test(prompt)) return "3:4"
  if (/横版|宽幅/.test(prompt)) return "3:2"
  return "1:1"
}

/** Formatting is not a product fact: retain every block, including separate negative fences. */
function plannerPrompt(section: string, position: number, requireComplete: boolean): string {
  const unfenced = section.replace(/^[\t ]*(?:`{3,}|~{3,})[a-zA-Z0-9_-]*[\t ]*$/gm, "")
  const content = extractFinalPrompt(unfenced).trim()
  const label = "(正向(?:\\s*(?:Prompt|提示词))?|正面(?:\\s*(?:Prompt|提示词))?|负向(?:\\s*(?:Prompt|提示词|约束))?|负面(?:\\s*(?:Prompt|提示词|约束))?|Positive\\s*Prompt|Negative\\s*Prompt)"
  const headings = new RegExp(`^[\\t ]*(?:#{1,6}[\\t ]*)?(?:\\*\\*)?(?:【[\\t ]*${label}[\\t ]*】|\\[[\\t ]*${label}[\\t ]*\\]|${label}(?:[\\t ]*[：:]|[\\t ]*$))(?:\\*\\*)?[\\t ]*[：:]?[\\t ]*`, "gmi")
  const normalized = content.replace(headings, (match, bracketed: string, square: string, plain: string, offset: number) => {
    const heading = /^(?:负|Negative)/i.test(bracketed || square || plain) ? "【负向 Prompt】" : "【正向 Prompt】"
    return heading + (content[offset + match.length] === "\n" ? "" : "\n")
  })
  const fields = [...normalized.matchAll(/【(正向|负向)\s*Prompt】/gi)]
  if (!fields.length) {
    // Some models write a complete combined instruction with inline avoid clauses.
    // Do not invent a negative section or reject intact prose for missing field labels.
    if (requireComplete && !content) throw new Error(`策划第 ${position} 条没有返回提示词正文，原提示词已保留`)
    return content
  }
  const positive: string[] = [], negative: string[] = []
  const prefix = normalized.slice(0, fields[0].index).trim()
  if (prefix) positive.push(prefix)
  for (const [index, field] of fields.entries()) {
    const body = normalized.slice(field.index! + field[0].length, fields[index + 1]?.index).trim()
    if (requireComplete && !body) throw new Error(`策划第 ${position} 条的${field[1]}提示词正文为空，原提示词已保留；可查看已保存的模型返回`)
    const target = field[1] === "正向" ? positive : negative
    target.push(body)
  }
  const hasPositiveHeading = fields.some(field => field[1] === "正向")
  if (requireComplete && (!(hasPositiveHeading || prefix) || !fields.some(field => field[1] === "负向"))) {
    throw new Error(`策划第 ${position} 条只返回了部分正负向内容，原提示词已保留；可查看已保存的模型返回`)
  }
  // A complete scene followed by a negative heading is already a positive/negative pair.
  // Only supply the missing structural label; do not generate or discard any prose.
  if (!hasPositiveHeading && prefix) return `【正向 Prompt】\n${normalized}`
  if (!positive.length || !negative.length) return normalized
  const firstNegative = fields.findIndex(field => field[1] === "负向")
  if (fields.slice(firstNegative).every(field => field[1] === "负向")) return normalized
  return `【正向 Prompt】\n${positive.join("\n\n")}\n\n【负向 Prompt】\n${negative.join("\n\n")}`
}

/** Parse known heading variants without changing the model's product/content decisions. */
export function parsePlannerRewrite(output: string, requireComplete = false): PlannerItem[] {
  assertAnalysisCanComplete(output)
  const items: PlannerItem[] = []
  const text = output.replace(/\r\n?/g, "\n")
  const headings = [...text.matchAll(/(?:^[\t ]*|(?<=```)|(?<=~~~))(?:#{1,6}[\t ]*)?(?:\*\*)?[【\[][\t ]*提示词[\t ]*(\d+)[\t ]*(?:[｜|:：][\t ]*([^】\]\n]*))?[】\]](?:\*\*)?[\t ]*/gm)]
  for (const [index, match] of headings.entries()) {
    if (requireComplete && Number(match[1]) !== items.length + 1) throw new Error("策划版位编号不连续或重复，本次未替换原提示词")
    const title = (match[2] || "").trim()
    if (requireComplete && !title) throw new Error(`策划第 ${index + 1} 条缺少版位名称，原提示词已保留`)
    const content = plannerPrompt(text.slice(match.index! + match[0].length, headings[index + 1]?.index).trim(), index + 1, requireComplete)
    if (content) items.push({ title, prompt: content })
  }
  if (items.length === 0) {
    if (requireComplete) throw new Error("策划返回中没有可识别的版位标题，原提示词已保留；可查看已保存的模型返回")
    const trimmed = (output || "").trim()
    if (trimmed) items.push({ title: "策划 1", prompt: trimmed })
  }
  return items
}
