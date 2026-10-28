import assert from "node:assert/strict"
import { POST } from "../src/app/api/images/route"
import { requestModelApi } from "../src/lib/model-api-client"
import { promptForImagePlan, resolveImagePlan } from "../src/lib/model-image-plan"

// All upstream calls are intercepted. These are transport checks, not model-quality claims.
async function main() {
  const originalFetch = globalThis.fetch
  // Native multipart/form-data normalizes LF to CRLF; no content is rewritten.
  const text = (value: unknown) => String(value).replace(/\r\n/g, "\n")
  const prompt = '  【正向 Prompt】\n画布16:9；商品尺寸12×80cm；左侧人物，右侧窗户。\n上图原文“Alles Gute!”\n【负向 Prompt】\n不添加广告。\n```保留我写的标记```\n' + '完整需求；'.repeat(1200) + '  '
  const requests: { url: string; body: Record<string, unknown>; files: string[] }[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url === "/api/provider-transport") {
      const endpoint = JSON.parse(String(init?.body)).endpoint as string
      assert.ok(endpoint === "https://api.openai.com/v1" || endpoint === "https://api.openlux.ai/v1")
      return Response.json({ mode: endpoint.includes("openlux") ? "direct" : "proxy", baseURL: endpoint })
    }
    if (url === "/api/images") return POST(new Request("http://localhost/api/images", init))
    assert.ok(url.startsWith("https://api.openai.com/") || url.startsWith("https://api.openlux.ai/"), "Any unexpected network destination fails the test")
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(String(init?.body))
    const files = init?.body instanceof FormData ? await Promise.all([...init.body.values()].filter((value): value is File => value instanceof File).map(file => file.text())) : []
    requests.push({ url, body, files })
    return url.includes(":generateContent")
      ? Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }] } }] })
      : Response.json({ data: [{ b64_json: "AA==" }] })
  }
  try {
    for (const endpoint of ["https://api.openai.com/v1", "https://api.openlux.ai/v1"]) {
      for (const model of ["gpt-image-2", "gemini-3-pro-image", "custom-image"]) {
        for (const imageCount of [0, 4]) {
          const plan = resolveImagePlan(model, "5:4", "2k", "5:4")
          assert.equal(promptForImagePlan(prompt, plan, "verbatim"), prompt)
          assert.equal(promptForImagePlan(prompt, resolveImagePlan(model, "auto"), "verbatim"), prompt)
          const form = new FormData()
          for (const [key, value] of Object.entries({ endpoint, apiKey: "mock-verbatim-no-real-key", model, prompt, promptMode: "verbatim", requestedSize: "5:4", qualityLevel: "2k", ratio: "5:4", size: plan.size, imageCount: "1", productImageCount: String(imageCount) })) form.set(key, value)
          for (let index = 0; index < imageCount; index++) form.append("images", new File([`mock-${index}`], `product-${index}.png`, { type: "image/png" }))
          const before = requests.length
          const response = await requestModelApi("/api/images", { method: "POST", body: form })
          assert.equal(response.status, 200, JSON.stringify(await response.json()))
          assert.equal(requests.length, before + 1, "One first request, no automatic repeat")
          const sent = requests.at(-1)!
          assert.equal(form.get("prompt"), prompt, "Client preserves whitespace, headings, copy and full detail")
          if (model.startsWith("gemini")) {
            const contents = sent.body.contents as { parts: { text?: string; inline_data?: unknown }[] }[]
            assert.deepEqual(contents[0].parts.filter(part => "text" in part).map(part => text(part.text)), [text(prompt)], "No product-identity instruction added before images")
            assert.equal(contents[0].parts.filter(part => "inline_data" in part).length, imageCount)
            assert.deepEqual((sent.body.generationConfig as { imageConfig: unknown }).imageConfig, { aspectRatio: "5:4", imageSize: "2K" })
          } else {
            assert.ok(text(sent.body.prompt) === text(prompt), "Proxy and direct preserve all original text (multipart newline normalization only)")
            assert.equal(sent.body.size, plan.size, "Canvas still goes through model-specific API parameters")
            assert.equal(Number(sent.body.n), 1)
            assert.deepEqual(sent.files, Array.from({ length: imageCount }, (_, index) => `mock-${index}`), "Every image retains its original order and bytes")
          }
        }
      }
    }
    assert.equal(requests.length, 12)
    assert.notEqual(promptForImagePlan(prompt, resolveImagePlan("gpt-image-2", "2048x2048")), prompt, "Existing unmarked tasks retain canvas/model adaptation")
    const empty = new FormData()
    empty.set("apiKey", "mock"); empty.set("prompt", "  \n  "); empty.set("promptMode", "verbatim")
    assert.equal((await POST(new Request("http://localhost/api/images", { method: "POST", body: empty }))).status, 400)
    assert.equal(requests.length, 12, "Empty prompt does not reach an upstream")
    console.log("PASS: 12 intercepted proxy/direct × GPT/Gemini/generic × text/four-image requests preserve exact user text and all images; native canvas and n=1 retained; empty input rejected; no real model calls")
  } finally { globalThis.fetch = originalFetch }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
