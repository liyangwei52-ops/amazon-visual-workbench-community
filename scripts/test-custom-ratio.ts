import assert from "node:assert/strict"
import { parseOutputRatio, isCustomOutputValid, customRatioLabel } from "../src/lib/output-ratio"
import { resolveImagePlan, promptForImagePlan, isValidGptImageSize } from "../src/lib/model-image-plan"
import { POST } from "../src/app/api/images/route"

async function main() {
  assert.equal(parseOutputRatio(" 10：8 ")?.label, "5:4")
  assert.equal(parseOutputRatio("1.5/4.5")?.label, "1:3")
  for (const invalid of ["", "0:3", "-1:3", "1:", "NaN:3", "Infinity:1"]) assert.equal(parseOutputRatio(invalid), null)
  assert.equal(isCustomOutputValid("1920x1080"), true, "旧像素保持兼容")
  assert.equal(customRatioLabel("1920x1080"), "16:9")
  for (const [ratio, quality, expected] of [["5:4", "1k", "1280x1024"], ["5:4", "2k", "2560x2048"], ["1:3", "1k", "1024x3072"], ["1:3", "2k", "1280x3840"]]) {
    const plan = resolveImagePlan("gpt-image-2", ratio, quality, "custom")
    assert.equal(plan.size, expected)
    const [w, h] = plan.size.split("x").map(Number)
    assert.ok(isValidGptImageSize(w, h))
    const prompt = promptForImagePlan("输出横向16:9构图，商品实测12×80cm。", plan)
    assert.ok(prompt.includes(expected))
    assert.ok(!prompt.includes("16:9"))
    assert.ok(prompt.includes("12×80cm"))
  }
  for (let i = 1; i <= 200; i++) {
    const plan = resolveImagePlan("gpt-image-2", `${i}:73`, "2k", "custom")
    assert.ok(isValidGptImageSize(...plan.size.split("x").map(Number) as [number, number]))
  }
  assert.equal(resolveImagePlan("gpt-image-2", "1920x1080", "2k", "custom").size, "1920x1088")
  const gemini = resolveImagePlan("gemini-3-pro-image", "5:4", "2k", "custom")
  assert.equal(gemini.aspectRatio, "5:4")
  assert.equal(gemini.resolution, "2K")
  assert.ok(resolveImagePlan("gemini-3-pro-image", "1:3", "2k", "custom").note.includes("不支持 1:3"))
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith("https://api.openai.com/"), "禁止未模拟外部请求")
    calls++
    const form = init?.body instanceof FormData ? init.body : null
    const body = form ? Object.fromEntries(form.entries()) : JSON.parse(String(init?.body))
    if (String(url).includes(":generateContent")) {
      assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "5:4", imageSize: "2K" })
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }] } }] })
    }
    assert.equal(body.size, "2560x2048")
    assert.ok(String(body.prompt).includes("2560x2048"))
    return Response.json({ data: [{ b64_json: "AA==" }] })
  }
  try {
    for (const [model, image] of [["gpt-image-2", false], ["gpt-image-2", true], ["gemini-3-pro-image", true]] as const) {
      const form = new FormData()
      for (const [key, value] of Object.entries({ endpoint: "https://api.openai.com/v1", apiKey: "mock-only", model, requestedSize: "5:4", size: "5:4", qualityLevel: "2k", ratio: "custom", prompt: "旧画布16:9，完整商品与配件要求。", imageCount: "1" })) form.set(key, value)
      if (image) form.set("images", new File(["fixture"], "p.png", { type: "image/png" }))
      const response = await POST(new Request("http://localhost/api/images", { method: "POST", body: form }))
      assert.equal(response.status, 200, await response.text())
    }
    assert.equal(calls, 3)
  } finally { globalThis.fetch = original }
  console.log("PASS: 自定义5:4/1:3与1K/2K、200组合法尺寸、旧像素兼容、GPT文生图/图文和Gemini真实路由出站控制（全模拟，零模型网络）")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
