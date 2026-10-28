import assert from "node:assert/strict"
import { productAnalysisImages, productIdentitySystemNote, parseProductImageCount } from "../src/lib/image-identities"
import { buildAnalysisContent } from "../src/lib/analysis-content"
import { buildImageIdentitySuffix } from "../src/lib/visual-shared"
import { requestGeminiImages } from "../src/lib/gemini-image-request"
import { resolveImagePlan } from "../src/lib/model-image-plan"
async function main() {
  const products = Array.from({ length: 4 }, (_, index) => ({ dataUrl: `data:image/png;base64,product-${index}` }))
  const images = [...productAnalysisImages(products), { dataUrl: "data:image/png;base64,reference", role: "reference", index: 5 }]
  assert.deepEqual(images.map(image => image.role), ["product", "product-detail", "product-detail", "product-detail", "reference"])
  const content = buildAnalysisContent("完整要求", images)
  for (const [index, image] of images.entries()) {
    assert.ok(content[index * 2 + 1].type === "text")
    assert.equal((content[index * 2 + 2] as { image_url: { url: string } }).image_url.url, image.dataUrl)
  }
  assert.ok(content[3].type === "text" && content[3].text.includes("我方补充产品图"))
  assert.ok(productIdentitySystemNote(4).includes("从图5开始"))
  assert.ok(buildImageIdentitySuffix(4, 2).includes("图6：竞品参考图"))
  assert.equal(parseProductImageCount(undefined, 6), 1)
  assert.equal(parseProductImageCount("4", 6), 4)
  for (const count of [5, -1, 1.5, "bad"]) assert.throws(() => parseProductImageCount(count, 6))
  assert.throws(() => parseProductImageCount(4, 3))
  let calls = 0
  await requestGeminiImages({ baseURL: "https://api.openlux.ai/v1", apiKey: "mock", plan: resolveImagePlan("gemini-3-pro-image-preview", "1024x1024"), prompt: "完整提示词", count: 1, productImageCount: 4,
    images: Array.from({ length: 6 }, (_, index) => new File([`image-${index}`], `${index}.png`, { type: "image/png" })), fetcher: async (_url, init) => {
      calls++
      const parts = JSON.parse(String(init?.body)).contents[0].parts
      assert.equal(parts.filter((part: { inline_data?: unknown }) => part.inline_data).length, 6)
      assert.ok(parts[1].text.includes("主产品图"))
      assert.ok(parts[3].text.includes("补充产品图"))
      assert.ok(parts[7].text.includes("补充产品图"))
      assert.ok(parts[9].text.includes("图5：竞品参考图"))
      assert.ok(parts[11].text.includes("图6：竞品参考图"))
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "mock" } }] } }] })
    } })
  assert.equal(calls, 1)
  console.log("PASS: 四张产品图主次身份、竞品编号、图文交错顺序；Gemini六图完整且身份正确；非法数量在本地阻止（模拟，无费用）")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
