import assert from "node:assert/strict"
import { requestModelApi } from "../src/lib/model-api-client"

const originalFetch = globalThis.fetch
async function main() {
  let release: (response: Response) => void = () => {}
  let modelCalls = 0
  globalThis.fetch = async input => {
    if (String(input) === "/api/provider-transport") return new Promise<Response>(resolve => { release = resolve })
    modelCalls++
    throw Error("停止后不得发出模型请求")
  }
  const controller = new AbortController()
  const pending = requestModelApi("/api/analyze", { signal: controller.signal, body: JSON.stringify({ endpoint: "https://api.openlux.ai/v1/stop-test", apiKey: "mock-only" }) })
  const start = Date.now()
  controller.abort()
  await assert.rejects(pending, error => error instanceof DOMException && error.name === "AbortError")
  assert.ok(Date.now() - start < 1000, "停止不能等待连接校验的15秒超时")
  release(new Response(JSON.stringify({ mode: "proxy", baseURL: "https://api.openlux.ai/v1/stop-test" })))
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(modelCalls, 0)
  console.log("PASS: 连接校验未完成时立即停止；延迟响应不触发模型提交（零网络）")
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { globalThis.fetch = originalFetch })
