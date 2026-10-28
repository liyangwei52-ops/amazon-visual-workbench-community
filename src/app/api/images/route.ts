import OpenAI from "openai"
import { NextResponse } from "next/server"

import { resolveLocale, t } from "@/lib/i18n"
import { imageFailureOutcome } from "@/lib/image-failure"
import { describeImageConnectionFailure, inspectImageTransportError, type ImageTransportFailure } from "@/lib/image-connection"
import {
  extractGeneratedImages,
  getImageApiError,
  getPayloadField,
  normalizeImageEndpoint,
} from "@/lib/image-request"
import { allowedApiBaseURL, EndpointNotAllowedError } from "@/lib/server-api-endpoint"
import { upstreamFetch, UPSTREAM_TIMEOUT_MS } from "@/lib/upstream-fetch"
import { streamJson } from "@/lib/stream-json"
import { resolveImagePlan, promptForImagePlan } from "@/lib/model-image-plan"
import { requestGeminiImages, GeminiImageError } from "@/lib/gemini-image-request"
import { parseProductImageCount } from "@/lib/image-identities"

export const runtime = "nodejs"
export const maxDuration = 300

const REQUEST_TIMEOUT_MS = UPSTREAM_TIMEOUT_MS
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MIN_CUSTOM_DIMENSION = 64
const MAX_CUSTOM_DIMENSION = 8192
const GENERATE_SIZE_VALUES = new Set([
  "auto",
  "256x256",
  "512x512",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1792x1024",
  "1024x1792",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
])
const EDIT_SIZE_VALUES = new Set([
  "auto",
  "256x256",
  "512x512",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
])
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

function getText(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key)

  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function getBackground(formData: FormData) {
  const value = getText(formData, "background", "auto")
  return value === "transparent" || value === "opaque" || value === "auto" ? value : "auto"
}

function getOutputFormat(formData: FormData) {
  const value = getText(formData, "outputFormat", "png")
  return value === "jpeg" || value === "webp" || value === "png" ? value : "png"
}

function getGenerateQuality(formData: FormData) {
  const value = getText(formData, "quality", "auto")
  return value === "auto" || value === "low" || value === "medium" || value === "high" || value === "standard" || value === "hd"
    ? value
    : "auto"
}

function normalizeCustomSize(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x")
  const match = /^([1-9]\d{1,4})x([1-9]\d{1,4})$/.exec(normalized)

  if (!match) {
    return ""
  }

  const width = Number(match[1])
  const height = Number(match[2])

  if (
    width < MIN_CUSTOM_DIMENSION ||
    width > MAX_CUSTOM_DIMENSION ||
    height < MIN_CUSTOM_DIMENSION ||
    height > MAX_CUSTOM_DIMENSION
  ) {
    return ""
  }

  return `${width}x${height}`
}

function getSize(formData: FormData, supportedSizes: Set<string>) {
  const value = getText(formData, "size", "1024x1024")
  const normalizedCustomSize = normalizeCustomSize(value)

  if (supportedSizes.has(value)) {
    return value
  }

  return normalizedCustomSize || "1024x1024"
}

function getEditQuality(formData: FormData) {
  const value = getText(formData, "quality", "auto")
  return value === "auto" || value === "low" || value === "medium" || value === "high" || value === "standard"
    ? value
    : "auto"
}

function getGenerateSize(formData: FormData) {
  return getSize(formData, GENERATE_SIZE_VALUES)
}

function getEditSize(formData: FormData) {
  return getSize(formData, EDIT_SIZE_VALUES)
}

export async function POST(request: Request) {
  let locale = resolveLocale(request.headers.get("accept-language"))
  let endpoint = ""
  let upstreamStarted = false
  const startedAt = Date.now()
  let transportFailure: ImageTransportFailure | undefined

  try {
    const incomingFormData = await request.formData()
    locale = resolveLocale(
      ((): string => {
        const value = incomingFormData.get("locale")
        return typeof value === "string" && value.trim()
          ? value.trim()
          : request.headers.get("accept-language") || ""
      })()
    )
    const apiKey = getText(incomingFormData, "apiKey")
    const promptMode = getText(incomingFormData, "promptMode") === "verbatim" ? "verbatim" : undefined
    const rawPrompt = incomingFormData.get("prompt")
    let prompt = promptMode && typeof rawPrompt === "string" ? rawPrompt : getText(incomingFormData, "prompt")

    if (!apiKey) {
      return NextResponse.json({ error: "请填写生图 API Key。" }, { status: 400 })
    }

    if (!prompt.trim()) {
      return NextResponse.json({ error: t(locale, "proxyPromptRequired") }, { status: 400 })
    }

    const images = incomingFormData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0)

    for (const image of images) {
      if (!SUPPORTED_IMAGE_TYPES.has(image.type)) {
        return NextResponse.json(
          { error: t(locale, "proxyUnsupportedImageFormat", { name: image.name }) },
          { status: 400 }
        )
      }

      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: t(locale, "proxyImageTooLarge", { name: image.name }) },
          { status: 400 }
        )
      }
    }

    let productImageCount
    try { productImageCount = parseProductImageCount(incomingFormData.get("productImageCount"), images.length) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "产品图数量无效", outcome: "failed" }, { status: 400 }) }
    let plan
    try { plan = resolveImagePlan(getText(incomingFormData, "model", "gpt-image-2"), getText(incomingFormData, "requestedSize", getText(incomingFormData, "size", "1024x1024")), getText(incomingFormData, "qualityLevel"), getText(incomingFormData, "ratio")) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "尺寸无效", outcome: "failed" }, { status: 400 }) }
    const model = plan.model
    incomingFormData.set("size", plan.size)
    prompt = promptForImagePlan(prompt, plan, promptMode)
    const baseURL = allowedApiBaseURL(getText(incomingFormData, "endpoint"))
    endpoint = normalizeImageEndpoint(baseURL, images.length > 0, locale)
    const outputFormat = getOutputFormat(incomingFormData)
    const imageCount = Number(getText(incomingFormData, "imageCount", "1"))
    const background = getBackground(incomingFormData)
    const n = Math.min(Math.max(imageCount, 1), 4)
    if (plan.protocol === "gemini") {
      upstreamStarted = true
      endpoint = baseURL.replace(/\/$/, "").replace(/\/(?:v1|v1beta)$/, "") + "/v1beta/models/" + encodeURIComponent(model) + ":generateContent"
      return streamJson(await requestGeminiImages({ baseURL, apiKey, plan, prompt, promptMode, images, productImageCount, count: n, fetcher: upstreamFetch,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) }))
    }
    const client = new OpenAI({
      apiKey,
      baseURL,
      // 生图可能已在上游执行，断线后自动重发会造成重复生成。
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
      fetch: async (input, init) => {
          try { return await upstreamFetch(input, init) }
        catch (error) {
          transportFailure = inspectImageTransportError(error)
          throw error
        }
      },
    })
    let payload: unknown
    let requestQuality = "auto"
    let requestSize = "1024x1024"

    upstreamStarted = true
    if (images.length) {
      const quality = getEditQuality(incomingFormData)
      const size = getEditSize(incomingFormData)

      requestQuality = quality
      requestSize = size
      payload = await client.images.edit({
        background,
        image: images.length === 1 ? images[0] : images,
        model,
        n,
        output_format: outputFormat,
        prompt,
        quality,
        size: size as OpenAI.Images.ImageEditParams["size"],
      })
    } else {
      const quality = getGenerateQuality(incomingFormData)
      const size = getGenerateSize(incomingFormData)

      requestQuality = quality
      requestSize = size
      payload = await client.images.generate({
        background,
        model,
        n,
        output_format: outputFormat,
        prompt,
        quality,
        size: size as OpenAI.Images.ImageGenerateParams["size"],
      })
    }

    const generatedImages = extractGeneratedImages(payload, outputFormat)

    if (!generatedImages.length) {
      return NextResponse.json(
        {
          endpoint,
          outcome: "interrupted",
          error: t(locale, "proxyNoImageField"),
        },
        { status: 502 }
      )
    }

    return streamJson({
      background: getPayloadField(payload, "background"),
      created: getPayloadField(payload, "created"),
      endpoint,
      images: generatedImages,
      model,
      outputFormat,
      quality: getPayloadField(payload, "quality") || requestQuality,
      size: getPayloadField(payload, "size") || requestSize,
      usage: getPayloadField(payload, "usage"),
    })
  } catch (error) {
    if (error instanceof GeminiImageError) return NextResponse.json({ error: error.message, outcome: error.outcome, endpoint }, { status: error.status })
    if (error instanceof EndpointNotAllowedError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof OpenAI.APIConnectionError) {
      const timedOut = error instanceof OpenAI.APIConnectionTimeoutError
      const failure = describeImageConnectionFailure(transportFailure, timedOut, Date.now() - startedAt)
      return NextResponse.json(
        {
          endpoint,
          ...failure,
        },
        { status: failure.outcome === "failed" ? 502 : timedOut ? 504 : 502 }
      )
    }
    if (error instanceof OpenAI.APIError) {
      const rawMessage = getImageApiError(error.error) || error.message || t(locale, "proxyRequestFailed", { status: error.status || 500 })
      const requestIdMatch = /request\s*id[:：\s]*([A-Za-z0-9_-]+)/i.exec(rawMessage)
      const requestId = requestIdMatch ? requestIdMatch[1] : ""

      if (/rejected by the safety system|content filter|safety system|content_policy|inappropriate/i.test(rawMessage)) {
        return NextResponse.json(
          {
            endpoint,
            outcome: "failed",
            error: `生图请求被上游安全系统拒绝（内容审核拦截）${requestId ? `，request id: ${requestId}` : ""}。常见原因：① 产品图/参考图内容触发审核；② 提示词含敏感元素。建议：换一张更简洁的产品图/参考图、精简提示词后重试；若确认无误，可携带 request id 联系中转站申诉。`,
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          endpoint,
          outcome: imageFailureOutcome(error.status || 502, rawMessage),
          error: rawMessage,
        },
        { status: error.status || 500 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    if (/provided fetch function does not support file uploads/i.test(errorMessage)) {
      return NextResponse.json({ endpoint, outcome: "failed", error: "文件上传初始化失败，任务尚未提交。请刷新后重试。" }, { status: 500 })
    }

    if (/timed out|timeout/i.test(errorMessage)) {
      return NextResponse.json(
        {
          endpoint,
          outcome: upstreamStarted ? "interrupted" : "failed",
          error: "生图请求等待超时，尚未收到上游的最终结果。",
        },
        { status: 504 }
      )
    }

    return NextResponse.json(
      {
        endpoint,
        outcome: upstreamStarted ? "interrupted" : "failed",
        error: error instanceof Error ? error.message : t(locale, "proxyGenerationFailed"),
      },
      { status: 500 }
    )
  }
}
