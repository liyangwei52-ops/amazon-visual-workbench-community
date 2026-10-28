import { readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"

import { extractPlannerDoc } from "../src/lib/planner-doc"
import { extractFinalPrompt, prepareImagePrompt } from "../src/lib/prompt-utils"
import { VISUAL_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/visual-strategist-prompt"

async function main() {
  const [configPath, imagePath, planPath] = process.argv.slice(3)
  if (!configPath || !imagePath || !planPath) throw new Error("Expected config, product image, and reference document")
  const config = readFileSync(configPath, "utf8").split(/\r?\n/).map((line) => line.trim())
  const valueAfter = (label: string) => {
    const index = config.indexOf(label)
    if (index < 0) throw new Error(`Missing ${label} in test config`)
    return config.slice(index + 1).find(Boolean) || ""
  }
  const endpoint = valueAfter("Api网址")
  const apiKey = valueAfter("Key")
  const label = valueAfter("分析模型")
  const model = label === "5.6 Sol" ? "gpt-5.6-sol" : label
  const product = `data:image/jpeg;base64,${readFileSync(imagePath).toString("base64")}`
  const bytes = readFileSync(planPath)
  const doc = await extractPlannerDoc(new File([new Uint8Array(bytes)], basename(planPath)))
  const reference = doc.images[0]
  if (!reference) throw new Error("Reference document has no extractable image")
  const images = [
    { dataUrl: product, role: "product", index: 1 },
    { dataUrl: reference.dataUrl, role: "reference", index: 2 },
  ]
  console.log(JSON.stringify({ stage: "request", model, imagesSent: images.length }))
  if (process.argv.includes("--dry-run")) return

  const response = await fetch("http://localhost:3000/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      apiKey,
      model,
      systemPrompt: VISUAL_STRATEGIST_SYSTEM_PROMPT,
      userText: "【用户额外需求】请为图1的草莓服装配件套装制作 Amazon 方形副图。借鉴图2的布局和光线，准确展示图1真实配件；不要把竞品商品或穿搭衬底算作销售内容。",
      images,
    }),
    signal: AbortSignal.timeout(300_000),
  })
  const result = await response.json() as { error?: string; prompt?: string }
  if (!response.ok) throw new Error((result.error || `HTTP ${response.status}`).replaceAll(apiKey, "[REDACTED]").slice(0, 700))
  const analysis = result.prompt || ""
  const finalPrompt = extractFinalPrompt(analysis)
  const imagePrompt = prepareImagePrompt(finalPrompt)
  writeFileSync("verification/user-workbench-analysis.txt", analysis)
  writeFileSync("verification/user-workbench-image-prompt.txt", imagePrompt)
  console.log(JSON.stringify({ stage: "response", analysisCharacters: analysis.length, finalCharacters: finalPrompt.length, imageCharacters: imagePrompt.length, hasNegativeConstraints: imagePrompt.includes("避免：") }))
  if (!analysis.includes("【最终 AI 绘图 Prompt】") || !imagePrompt.includes("避免：")) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
