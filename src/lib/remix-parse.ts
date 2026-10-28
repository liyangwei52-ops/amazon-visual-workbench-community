import { assertAnalysisCanComplete, extractFinalPrompt } from "./prompt-utils"

/** 只接收完整连续且无重复编号的结果，避免混入旧商品提示词。 */
export function parseRemixRewrite(output: string, count: number): string[] {
  assertAnalysisCanComplete(output)
  const sections = output.split(/【提示词\s*(\d+)(?:\s*[｜|：:]\s*[^】]+)?】/i)
  const results = new Array<string>(count).fill("")
  for (let i = 1; i + 1 < sections.length; i += 2) {
    const index = Number(sections[i]) - 1
    if (index < 0 || index >= count || results[index]) throw new Error("迁移结果编号重复或超出范围，本次未替换原提示词")
    const prompt = extractFinalPrompt(sections[i + 1])
    if (!/【正向\s*Prompt】/i.test(prompt) || !/【负向\s*Prompt】/i.test(prompt)) throw new Error(`迁移第 ${index + 1} 条缺少完整正向或负向提示词，本次未替换原提示词`)
    results[index] = prompt
  }
  if (results.some(prompt => !prompt)) throw new Error(`迁移结果仅返回 ${results.filter(Boolean).length}/${count} 条，本次未替换原提示词，请重试`)
  return results
}
