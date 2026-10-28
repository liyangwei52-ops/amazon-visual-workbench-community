import assert from "node:assert/strict"
import { requestModelApi, MODEL_REQUEST_TIMEOUT_MS, TRANSPORT_TIMEOUT_MS } from "../src/lib/model-api-client"

const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })
const hang = (signal: AbortSignal) => new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
const body = (endpoint: string) => JSON.stringify({ endpoint, apiKey: "mock-deadline", model: "test", systemPrompt: "完整模板", userText: "完整需求", images: [] })

async function main() {
  assert.equal(MODEL_REQUEST_TIMEOUT_MS, 900000)
  AbortSignal.timeout = (ms: number) => originalTimeout(ms === MODEL_REQUEST_TIMEOUT_MS ? 100 : ms === TRANSPORT_TIMEOUT_MS ? 40 : ms)
  for (const mode of ["proxy", "direct"]) for (const stall of ["headers", "body"]) {
    const endpoint = `https://api.openlux.ai/v1/deadline-${mode}-${stall}`
    let modelCalls = 0
    globalThis.fetch = async (input, init) => {
      if (String(input) === "/api/provider-transport") return json({ mode, baseURL: endpoint })
      modelCalls++
      const signal = init!.signal as AbortSignal
      if (stall === "headers") return hang(signal)
      return new Response(new ReadableStream({ start(controller) { signal.addEventListener("abort", () => controller.error(signal.reason), { once: true }) } }), { headers: { "Content-Type": "application/json" } })
    }
    const result = await requestModelApi("/api/analyze", { body: body(endpoint) })
    const data = await result.json()
    assert.equal(result.status, 504); assert.equal(data.outcome, "interrupted")
    assert.ok(data.error.includes("15分钟") && data.error.includes("不会自动重发"))
    assert.equal(modelCalls, 1, "Timeout cannot resubmit")
  }
  let transportCalls = 0, modelCalls = 0
  const endpoint = "https://api.openlux.ai/v1/transport-timeout"
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/provider-transport") { transportCalls++; return transportCalls === 1 ? hang(init!.signal as AbortSignal) : json({ mode: "proxy", baseURL: endpoint }) }
    modelCalls++; return json({ prompt: "已完成，全文保留" })
  }
  const notSent = await requestModelApi("/api/analyze", { body: body(endpoint) })
  assert.equal(notSent.status, 400); assert.ok((await notSent.json()).error.includes("尚未提交")); assert.equal(modelCalls, 0)
  assert.equal((await (await requestModelApi("/api/analyze", { body: body(endpoint) })).json()).prompt, "已完成，全文保留")
  assert.equal(transportCalls, 2); assert.equal(modelCalls, 1)
  const controller = new AbortController()
  globalThis.fetch = async (_, init) => hang(init!.signal as AbortSignal)
  setTimeout(() => controller.abort(new DOMException("User left", "AbortError")), 5)
  await assert.rejects(requestModelApi("/api/analyze", { body: body(endpoint), signal: controller.signal }), /User left/)
  console.log("PASS: 直连/代理响应头及响应体超时均结束等待、状态待确认、仅首次请求；连接校验超时未提交且可恢复；用户取消保持原语义（无网络）")
}
// Keep Node alive while testing the unref'd native AbortSignal timers.
const keepAlive = setInterval(() => {}, 1000)
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; clearInterval(keepAlive) })
