import assert from "node:assert/strict"
import { RATIO_OPTIONS, sizeFromRatioQuality } from "../src/lib/visual-shared"
import { resolveImagePlan, isValidGptImageSize } from "../src/lib/model-image-plan"
import { requestModelApi } from "../src/lib/model-api-client"

async function main() {
  for (const { value: ratio } of RATIO_OPTIONS.filter(x => x.value !== "custom")) {
    for (const quality of ["1k", "2k"] as const) {
      const size = sizeFromRatioQuality(ratio, quality)
      const [width, height] = size.split("x").map(Number)
      assert.equal(width % 16, 0, `${ratio}/${quality} width`)
      assert.equal(height % 16, 0, `${ratio}/${quality} height`)
      assert.equal(resolveImagePlan("gpt-image-2", size).size, size)
      if (ratio === "21:9") assert.equal(width * 9, height * 21)
    }
  }
  assert.equal(sizeFromRatioQuality("16:9", "2k"), "2048x1152")
  assert.equal(sizeFromRatioQuality("21:9", "1k"), "2464x1056")
  assert.equal(sizeFromRatioQuality("21:9", "2k"), "3584x1536")
  for (const invalid of ["3840x1620", "2520x1080"]) { const [w,h]=resolveImagePlan("gpt-image-2", invalid).size.split("x").map(Number); assert.ok(isValidGptImageSize(w,h)) }
  assert.equal(resolveImagePlan("gpt-image-2", "auto").size, "auto")
  assert.equal(resolveImagePlan("gpt-image-2", "3584 × 1536").size, "3584x1536")
  assert.equal(resolveImagePlan("other-image-model", "3840x1620").size, "3840x1620")
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error("Invalid size must not reach the network") }
  try {
    const form = new FormData()
    form.set("model", "gpt-image-2"); form.set("size", "not-a-size")
    const response = await requestModelApi("/api/images", { body: form })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).outcome, "failed")
    assert.equal(requests, 0)
  } finally { globalThis.fetch = originalFetch }
  console.log("PASS: 全部18组预设保持有效；21:9精确比例；旧尺寸就近适配；无效格式不发请求；其他模型不强制按16对齐")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
