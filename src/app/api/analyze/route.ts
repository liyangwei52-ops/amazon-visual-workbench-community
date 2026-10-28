import OpenAI from "openai"
import { buildAnalysisContent } from "@/lib/analysis-content"
import { NextResponse } from "next/server"

import { allowedApiBaseURL, EndpointNotAllowedError } from "@/lib/server-api-endpoint"
import { MAX_ANALYZE_IMAGES, MAX_ANALYZE_IMAGE_BYTES, MAX_ANALYZE_IMAGE_URL_BYTES, MAX_ANALYZE_REQUEST_BYTES } from "@/lib/analyze-limits"
import { upstreamFetch, UPSTREAM_TIMEOUT_MS } from "@/lib/upstream-fetch"

export const runtime = "nodejs"
export const maxDuration = 300

const REQUEST_TIMEOUT_MS = UPSTREAM_TIMEOUT_MS
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

type AnalyzeImageInput = {
  /** Validated image data URL */
  dataUrl: string
  /** 图片身份：product / reference */
  role: string
  index: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || ""
  return Math.floor((base64.length * 3) / 4)
}

export async function POST(request: Request) {
  let endpoint = ""
  let images: AnalyzeImageInput[] = []

  try {
    const declaredLength = Number(request.headers.get("content-length") || 0)
    if (declaredLength > MAX_ANALYZE_REQUEST_BYTES) {
      return NextResponse.json({ error: "分析请求体超过 4MB，请压缩图片后重试。" }, { status: 413 })
    }
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_ANALYZE_REQUEST_BYTES) {
      return NextResponse.json({ error: "分析请求体超过 4MB，请重新提交以自动处理图片，或分批分析。" }, { status: 413 })
    }
    const body: unknown = JSON.parse(text)

    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const apiKey = asString(body.apiKey)
    const model = asString(body.model) || "gpt-4o"
    const systemPrompt = asString(body.systemPrompt)
    const userText = asString(body.userText)
    const rawImages = Array.isArray(body.images) ? body.images : []

    endpoint = allowedApiBaseURL(asString(body.endpoint))

    if (!apiKey) {
      return NextResponse.json({ error: "请填写 API Key。" }, { status: 400 })
    }

    if (!systemPrompt) {
      return NextResponse.json({ error: "系统提示词不能为空。" }, { status: 400 })
    }

    if (rawImages.length > MAX_ANALYZE_IMAGES) {
      return NextResponse.json(
        { error: `一次分析最多支持 ${MAX_ANALYZE_IMAGES} 张图片。` },
        { status: 400 }
      )
    }

    const parsedImages: AnalyzeImageInput[] = []
    let totalImageUrlChars = 0
    for (const [index, item] of rawImages.entries()) {
      if (!isRecord(item) || !IMAGE_DATA_URL.test(asString(item.dataUrl))) {
        return NextResponse.json({ error: `第 ${index + 1} 张图片格式无效；请上传 PNG / JPG / WEBP。` }, { status: 400 })
      }
      const dataUrl = asString(item.dataUrl)
      totalImageUrlChars += dataUrl.length
      if (totalImageUrlChars > MAX_ANALYZE_IMAGE_URL_BYTES) {
        return NextResponse.json({ error: "产品图与参考图总量超过分析上限，请刷新页面后重新提交以自动处理图片。" }, { status: 413 })
      }
      if (estimateDataUrlBytes(dataUrl) > MAX_ANALYZE_IMAGE_BYTES) {
        return NextResponse.json({ error: `第 ${index + 1} 张图片超过 10MB。` }, { status: 400 })
      }
      parsedImages.push({
        dataUrl,
        role: asString(item.role) || "reference",
        index: typeof item.index === "number" ? item.index : index + 1,
      })
    }
    images = parsedImages

    const client = new OpenAI({
      apiKey,
      baseURL: endpoint,
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
      fetch: upstreamFetch,
    })

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildAnalysisContent(userText, images),
        },
      ],
    })

    const choice = completion.choices?.[0]
    if (choice?.finish_reason === "length") {
      return NextResponse.json(
        { error: "模型输出达到长度上限，本次提示词没有完整返回，未分发到提示词框。请将策划分成较少版位重试，或使用输出容量更大的模型；系统不会自动压缩提示词。" },
        { status: 502 }
      )
    }
    const prompt = choice?.message?.content || ""

    if (!prompt.trim()) {
      return NextResponse.json({ error: "分析模型未返回内容。" }, { status: 502 })
    }

    return NextResponse.json({
      endpoint,
      model,
      prompt,
      usage: completion.usage || undefined,
    })
  } catch (error) {
    if (error instanceof EndpointNotAllowedError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof OpenAI.APIError) {
      const rawMessage = error.message || `上游请求失败：${error.status || 500}`
      const requestIdMatch = /request\s*id[:：\s]*([A-Za-z0-9_-]+)/i.exec(rawMessage)
      const requestId = requestIdMatch ? requestIdMatch[1] : ""

      if (/rejected by the safety system|content filter|safety system|content_policy|inappropriate/i.test(rawMessage)) {
        return NextResponse.json(
          {
            endpoint,
            error: `分析请求被上游安全系统拒绝（内容审核拦截）${requestId ? `，request id: ${requestId}` : ""}。常见原因：① 产品图/参考图内容触发审核（如含人物面部、品牌标识、敏感元素）；② 提示词或产品信息含敏感词。建议：换一张更简洁的产品图或参考图、精简产品信息后重试；若确认无误，可携带 request id 联系中转站申诉。`,
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          endpoint,
          error: rawMessage,
        },
        { status: error.status || 500 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    if (error instanceof OpenAI.APIConnectionTimeoutError || /timed out|timeout/i.test(errorMessage)) {
      return NextResponse.json(
        {
          endpoint,
          error: `分析请求超时（已等待 15 分钟）。可能是中转站响应慢或图片过大，请检查 Api网址/中转站负载，或换更快的分析模型后重试。`,
        },
        { status: 504 }
      )
    }

    return NextResponse.json(
      {
        endpoint,
        error: error instanceof Error ? error.message : "分析请求失败。",
      },
      { status: 500 }
    )
  }
}
