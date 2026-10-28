import { readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"

import { extractPlannerDoc } from "../src/lib/planner-doc"
import { PLANNER_SYSTEM_PROMPT } from "../src/lib/planner-strategist-prompt"
import { parsePlannerRewrite } from "../src/lib/planner-parse"

async function main() {
  const [configPath, imagePath, planPath] = process.argv.slice(3)
  if (!configPath || !imagePath || !planPath) throw new Error("Expected config, product image, and plan file paths")

  const config = readFileSync(configPath, "utf8").split(/\r?\n/).map((line) => line.trim())
  const valueAfter = (label: string) => {
    const index = config.indexOf(label)
    if (index < 0) throw new Error(`Missing ${label} in test config`)
    return config.slice(index + 1).find(Boolean) || ""
  }
  const endpoint = valueAfter("Api网址")
  const apiKey = valueAfter("Key")
  const modelLabel = valueAfter("分析模型")
  const model = modelLabel === "5.6 Sol" ? "gpt-5.6-sol" : modelLabel
  if (!endpoint.startsWith("https://") || !apiKey) throw new Error("Analysis endpoint must be HTTPS and have a key")

  const imageBytes = readFileSync(imagePath)
  const productImage = `data:image/jpeg;base64,${imageBytes.toString("base64")}`
  const planBytes = readFileSync(planPath)
  const planDoc = await extractPlannerDoc(new File([new Uint8Array(planBytes)], basename(planPath)))
  const userText = `【策划文档：${planDoc.fileName}】\n${planDoc.text}\n${planDoc.images.length ? "文档内嵌参考图见图2及后续图片。" : ""}\n仅借鉴其版位/文案/版面布局与竞品构图，产品本体一律以图1 为准。\n\n请按你的角色要求，依据图1 产品图（+产品信息/策划文档/补充策划）逐条输出成品提示词。`
  const images = [{ dataUrl: productImage, role: "product", index: 1 }]
  let bodyChars = JSON.stringify({ userText, images }).length
  let omittedImages = planDoc.droppedImages
  for (const image of planDoc.images) {
    if (bodyChars + image.dataUrl.length > 3.5 * 1024 * 1024) {
      omittedImages++
      continue
    }
    images.push({ dataUrl: image.dataUrl, role: "reference", index: images.length + 1 })
    bodyChars += image.dataUrl.length
  }
  console.log(JSON.stringify({ stage: "request", model, textCharacters: planDoc.text.length, imagesSent: images.length, imagesOmitted: omittedImages }))
  if (process.argv.includes("--dry-run")) return

  const start = Date.now()
  const response = await fetch("http://localhost:3000/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, apiKey, model, systemPrompt: PLANNER_SYSTEM_PROMPT, userText, images }),
    signal: AbortSignal.timeout(300_000),
  })
  const result = await response.json() as { error?: string; prompt?: string }
  if (!response.ok) {
    const message = (result.error || `HTTP ${response.status}`).replaceAll(apiKey, "[REDACTED]")
    throw new Error(`Analysis failed (${response.status}): ${message.slice(0, 700)}`)
  }

  const prompt = result.prompt || ""
  const entries = parsePlannerRewrite(prompt)
  writeFileSync("verification/user-planner-analysis.txt", prompt)
  writeFileSync("verification/user-planner-distribution.json", JSON.stringify(entries, null, 2))
  console.log(JSON.stringify({ stage: "response", seconds: Math.round((Date.now() - start) / 1000), promptCharacters: prompt.length, distributedEntries: entries.length, titles: entries.map((entry) => entry.title) }))
  if (!entries.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
