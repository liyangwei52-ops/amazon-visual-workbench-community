"use client"

import { buildAnalysisContent, type AnalysisImage } from "./analysis-content"
import { extractGeneratedImages, getImageApiError } from "./image-request"
import { imageFailureOutcome } from "./image-failure"
import { resolveImagePlan, promptForImagePlan } from "./model-image-plan"
import { requestGeminiImages, GeminiImageError } from "./gemini-image-request"
import { parseProductImageCount } from "./image-identities"

type Transport = { mode: "direct" | "proxy"; baseURL: string }
const transports = new Map<string, Promise<Transport>>()
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } })
export const MODEL_REQUEST_TIMEOUT_MS = 15 * 60 * 1000
export const TRANSPORT_TIMEOUT_MS = 15_000

/** 共享连接校验或完整响应体尚在等待时，用户停止也须立即结束本地等待。 */
async function waitWithSignal<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let onAbort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
  })
  try { return await Promise.race([work(), cancelled]) }
  finally { signal.removeEventListener("abort", onAbort) }
}

async function transportFor(endpoint: string): Promise<Transport> {
  if (!transports.has(endpoint)) transports.set(endpoint, (async () => {
    const signal = AbortSignal.timeout(TRANSPORT_TIMEOUT_MS)
    let response: Response, data: Transport & { error?: string }
    try {
      response = await fetch("/api/provider-transport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }), signal })
      data = await response.json()
    } catch (error) {
      if (signal.aborted) throw new Error("服务商连接校验超时（15秒），尚未提交模型请求，请稍后重试。")
      throw error
    }
    if (!response.ok) throw new Error(data.error || "服务商地址校验失败")
    // 双重校验，不把密钥发送到服务端返回的任意地址。
    if (data.mode === "direct" && (new URL(data.baseURL).origin !== "https://api.openlux.ai" || new URL(endpoint).origin !== "https://api.openlux.ai")) throw new Error("服务商地址不匹配")
    return data as Transport
  })().catch(error => { transports.delete(endpoint); throw error }))
  return transports.get(endpoint)!
}

/** 云端 OpenLux 使用浏览器直连，规避部署平台的5分钟限制；失败后不自动重发。 */
export async function requestModelApi(path: "/api/analyze" | "/api/images", init: RequestInit): Promise<Response> {
  const deadline = AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)
  const signal = AbortSignal.any([deadline, ...(init.signal ? [init.signal] : [])])
  try {
    const response = await waitWithSignal(() => performModelApi(path, init, signal), signal)
    signal.throwIfAborted()
    // Cover the complete response body as well as connection/headers, including proxies.
    const body = await waitWithSignal(() => response.blob(), signal)
    signal.throwIfAborted()
    const headers = new Headers(response.headers)
    headers.delete("content-length"); headers.delete("content-encoding")
    return new Response(response.status === 204 || response.status === 304 ? null : body, { status: response.status, statusText: response.statusText, headers })
  } catch (error) {
    if (deadline.aborted) return jsonResponse({ error: `${path === "/api/images" ? "生图" : "分析"}请求等待已超过15分钟，已结束本次等待。结果尚未确认，上游可能仍在处理；请核查服务商记录后再手动重试，系统不会自动重发。`, outcome: "interrupted" }, 504)
    throw error
  }
}

async function performModelApi(path: "/api/analyze" | "/api/images", init: RequestInit, signal: AbortSignal): Promise<Response> {
  const form = init.body instanceof FormData ? init.body : null
  const promptMode = form?.get("promptMode") === "verbatim" ? "verbatim" : undefined
  if (form) {
    try {
      form.set("productImageCount", String(parseProductImageCount(form.get("productImageCount"), form.getAll("images").filter(value => value instanceof File && value.size > 0).length)))
      const requested = String(form.get("requestedSize") || form.get("size") || "1024x1024")
      const plan = resolveImagePlan(String(form.get("model") || "gpt-image-2"), requested, String(form.get("qualityLevel") || ""), String(form.get("ratio") || ""))
      form.set("requestedSize", requested); form.set("model", plan.model); form.set("size", plan.size)
      form.set("prompt", promptForImagePlan(String(form.get("prompt") || ""), plan, promptMode))
    } catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : "尺寸无效", outcome: "failed" }, 400) }
  }
  const analysis = form ? null : JSON.parse(String(init.body)) as { endpoint: string; apiKey: string; model: string; systemPrompt: string; userText: string; images: AnalysisImage[] }
  const endpoint = form ? String(form.get("endpoint") || "") : analysis!.endpoint
  let transport: Transport
  try { transport = await transportFor(endpoint) }
  catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : "服务商校验失败", outcome: "failed" }, 400) }
  signal.throwIfAborted()
  if (transport.mode === "proxy") return fetch(path, { ...init, signal })

  const apiKey = form ? String(form.get("apiKey") || "") : analysis!.apiKey
  if (form) {
    const plan = resolveImagePlan(String(form.get("model")), String(form.get("requestedSize")), String(form.get("qualityLevel") || ""), String(form.get("ratio") || ""))
    if (plan.protocol === "gemini") {
      try {
        return jsonResponse(await requestGeminiImages({ baseURL: transport.baseURL, apiKey, plan, prompt: String(form.get("prompt") || ""), promptMode,
          images: form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0), productImageCount: form.has("productImageCount") ? Number(form.get("productImageCount")) : undefined, count: Number(form.get("imageCount")) || 1, fetcher: (...args) => fetch(...args), signal }))
      } catch (error) {
        if (error instanceof GeminiImageError) return jsonResponse({ error: error.message, outcome: error.outcome }, error.status)
        throw error
      }
    }
  }
  let url: string
  let body: FormData | string
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
  if (form) {
    const images = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0)
    const parameters = {
      model: String(form.get("model") || "gpt-image-2"),
      prompt: String(form.get("prompt") || ""),
      size: String(form.get("size") || "1024x1024"),
      quality: String(form.get("quality") || "auto"),
      output_format: String(form.get("outputFormat") || "png"),
      background: String(form.get("background") || "auto"),
      n: Math.min(4, Math.max(1, Number(form.get("imageCount")) || 1)),
    }
    url = transport.baseURL.replace(/\/$/, "") + (images.length ? "/images/edits" : "/images/generations")
    if (images.length) {
      const outgoing = new FormData()
      for (const [key, value] of Object.entries(parameters)) outgoing.append(key, String(value))
      images.forEach(image => outgoing.append(images.length === 1 ? "image" : "image[]", image))
      body = outgoing
    } else { headers["Content-Type"] = "application/json"; body = JSON.stringify(parameters) }
  } else {
    url = transport.baseURL.replace(/\/$/, "") + "/chat/completions"
    headers["Content-Type"] = "application/json"
    body = JSON.stringify({ model: analysis!.model, messages: [ { role: "system", content: analysis!.systemPrompt }, { role: "user", content: buildAnalysisContent(analysis!.userText, analysis!.images) } ] })
  }
  const response = await fetch(url, { method: "POST", headers, body, signal })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (getImageApiError(data) || `服务商请求失败（HTTP ${response.status}）`).replaceAll(apiKey, "[已隐藏]")
    return jsonResponse({ error, outcome: imageFailureOutcome(response.status, error) }, response.status)
  }
  if (form) {
    const images = extractGeneratedImages(data, String(form.get("outputFormat") || "png"))
    return images.length ? jsonResponse({ images, model: form.get("model"), size: form.get("size"), usage: data?.usage }) : jsonResponse({ error: "生图模型未返回图片，请核查服务商结果后再重试", outcome: "interrupted" }, 502)
  }
  if (data?.choices?.[0]?.finish_reason === "length") return jsonResponse({ error: "模型输出达到长度上限，本次未分发；请减少每批版位，不压缩提示词。" }, 502)
  const prompt = data?.choices?.[0]?.message?.content
  return typeof prompt === "string" && prompt.trim() ? jsonResponse({ prompt, model: analysis!.model, usage: data.usage }) : jsonResponse({ error: "分析模型未返回内容" }, 502)
}
