import { readFileSync, writeFileSync } from "node:fs"

import { applyRequestedOutputSize, extractFinalPrompt, prepareImagePrompt } from "../src/lib/prompt-utils"

async function main() {
  const [configPath, productPath, analysisPath, pixelSize = "1536x1024"] = process.argv.slice(3)
  if (!configPath || !productPath || !analysisPath) throw new Error("Expected config, product image, and planner analysis")
  const config = readFileSync(configPath, "utf8").split(/\r?\n/).map((line) => line.trim())
  const valueAfter = (label: string) => {
    const index = config.indexOf(label)
    if (index < 0) throw new Error(`Missing ${label} in test config`)
    return config.slice(index + 1).find(Boolean) || ""
  }
  const apiKey = valueAfter("生图Key")
  const endpoint = valueAfter("Api网址")
  const output = readFileSync(analysisPath, "utf8")
  const first = /【提示词 1｜[^】]+】([\s\S]*?)(?=【提示词 2｜|$)/.exec(output)?.[1]?.trim()
  if (!first) throw new Error("Missing first planner prompt")

  const form = new FormData()
  form.set("endpoint", endpoint)
  form.set("apiKey", apiKey)
  form.set("model", "gpt-image-2")
  form.set("prompt", applyRequestedOutputSize(`${prepareImagePrompt(extractFinalPrompt(first))}\n\n图1为我方产品图，必须保持真实商品结构、颜色、材质和数量。`, pixelSize))
  form.set("quality", "auto")
  form.set("outputFormat", "png")
  form.set("background", "auto")
  form.set("imageCount", "1")
  form.set("size", pixelSize)
  form.append("images", new File([new Uint8Array(readFileSync(productPath))], "product.jpg", { type: "image/jpeg" }))

  const started = Date.now()
  const response = await fetch("http://localhost:3000/api/images", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(300_000),
  })
  const result = await response.json() as { error?: string; outcome?: string; images?: { src: string }[] }
  const report = { status: response.status, requestedSize: pixelSize, outcome: result.outcome, elapsedMs: Date.now() - started, error: result.error?.replaceAll(apiKey, "[REDACTED]") }
  writeFileSync("verification/user-image-request-result.json", JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  if (!response.ok) throw new Error((result.error || `HTTP ${response.status}`).replaceAll(apiKey, "[REDACTED]").slice(0, 700))
  const src = result.images?.[0]?.src || ""
  const match = /^data:image\/png;base64,(.+)$/.exec(src)
  if (!match) throw new Error("Image API did not return a PNG data URL")
  const bytes = Buffer.from(match[1], "base64")
  writeFileSync("verification/user-reworked-image-" + pixelSize + ".png", bytes)
  console.log(JSON.stringify({ status: "ok", imageBytes: bytes.length, promptCharacters: first.length }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
