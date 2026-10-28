import { readFileSync } from "node:fs"
import { basename } from "node:path"

import { extractPlannerDoc } from "../src/lib/planner-doc"

async function main() {
  const inputPath = process.argv[3]
  if (!inputPath) throw new Error("Usage: node scripts/run-ts-test.cjs scripts/check-planner-file.ts <document>")

  const bytes = readFileSync(inputPath)
  const file = new File([new Uint8Array(bytes)], basename(inputPath))
  const result = await extractPlannerDoc(file)
  console.log(JSON.stringify({
    type: result.type,
    textCharacters: result.text.length,
    extractedImages: result.images.length,
    droppedImages: result.droppedImages,
    imageNames: result.images.map((image) => image.name),
    imageSources: result.images.map((image) => image.source || ""),
  }))
  if (process.argv.includes("--text")) console.log(result.text)
  if (result.type === "unsupported" || (!result.text && !result.images.length)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
