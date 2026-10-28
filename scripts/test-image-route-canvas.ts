import assert from "node:assert/strict"
import { POST } from "../src/app/api/images/route"

async function main() {
  const original = globalThis.fetch
  const requests: { prompt: string; size?: string; config?: unknown }[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    assert.ok(url.startsWith("https://api.openai.com/"), "Mock only; unknown requests are rejected")
    if (url.includes(":generateContent")) {
      const body = JSON.parse(String(init?.body))
      requests.push({ prompt: body.contents[0].parts[0].text, config: body.generationConfig.imageConfig })
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }] } }] })
    }
    assert.ok(url.endsWith("/images/generations") || url.endsWith("/images/edits"))
    const form = init?.body instanceof FormData ? init.body : null
    const body = form ? Object.fromEntries(form.entries()) : JSON.parse(String(init?.body))
    requests.push({ prompt: String(body.prompt), size: String(body.size) })
    return Response.json({ data: [{ b64_json: "AA==" }] })
  }
  try {
    for (const [model, withImage] of [["gpt-image-2", false], ["gpt-image-2", true], ["gemini-3-pro-image", true]] as const) {
      const form = new FormData()
      for (const [key, value] of Object.entries({ endpoint: "https://api.openai.com/v1", apiKey: "mock-server-canvas", model, prompt: "完整正文。画布尺寸3072×1728像素，横向16:9构图；产品尺寸12×80cm，禁止新增配件。", size: "2048x2048", requestedSize: "2048x2048", ratio: "1:1", qualityLevel: "2k", imageCount: "1", productImageCount: withImage ? "1" : "0" })) form.set(key, value)
      if (withImage) form.append("images", new File(["mock"], "product.png", { type: "image/png" }))
      const response = await POST(new Request("http://localhost/api/images", { method: "POST", body: form }))
      const data = await response.json()
      assert.equal(response.status, 200, JSON.stringify(data))
      assert.equal(data.images.length, 1)
      const sent = requests.at(-1)!
      assert.ok(sent.prompt.startsWith("完整正文。"))
      assert.equal(sent.prompt.split("<!-- avw:canvas:v2 -->").length, 2)
      assert.equal(sent.prompt.split("<!-- avw:image-model:v2 -->").length, 2)
      assert.ok(sent.prompt.includes("没有指定或要求创作文案时不添加标题"))
      assert.ok(!sent.prompt.includes("【本次输出画布·最高优先级】"))
      assert.ok(!sent.prompt.includes("16:9"))
      assert.ok(!sent.prompt.includes("3072×1728"))
      assert.ok(sent.prompt.includes("12×80cm"))
      assert.ok(sent.prompt.includes("禁止新增配件"))
      if (model.startsWith("gemini")) assert.deepEqual(sent.config, { aspectRatio: "1:1", imageSize: "2K" })
      else assert.equal(sent.size, "2048x2048")
    }
    assert.equal(requests.length, 3)
    console.log("PASS: 真实POST路由的GPT文生图/图文编辑与Gemini原生出站参数和正文画幅一致（全网络模拟，零费用）")
  } finally { globalThis.fetch = original }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
