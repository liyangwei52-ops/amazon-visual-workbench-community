import { DEFAULT_LOCALE, type Locale, t } from "./i18n"

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"

type UnknownRecord = Record<string, unknown>

export type GeneratedImage = {
  revisedPrompt?: string
  src: string
}

export function normalizeOpenAIBaseURL(value: string, locale: Locale = DEFAULT_LOCALE) {
  const rawEndpoint = (value || DEFAULT_OPENAI_BASE_URL).trim().replace(/\/+$/, "")

  try {
    const url = new URL(rawEndpoint)
    const pathname = url.pathname.replace(/\/+$/, "")

    if (pathname.endsWith("/images/generations") || pathname.endsWith("/images/edits")) {
      url.pathname = pathname.replace(/\/images\/(?:generations|edits)$/, "")
      return url.toString().replace(/\/+$/, "")
    }

    if (pathname.endsWith("/images")) {
      url.pathname = pathname.replace(/\/images$/, "") || "/"
      return url.toString().replace(/\/+$/, "")
    }

    if (!pathname || pathname === "/") {
      url.pathname = "/v1"
      return url.toString()
    }

    url.pathname = pathname
    return url.toString()
  } catch {
    throw new Error(t(locale, "invalidEndpoint"))
  }
}

export function normalizeImageEndpoint(
  value: string,
  hasInputImages: boolean,
  locale: Locale = DEFAULT_LOCALE
) {
  const operation = hasInputImages ? "edits" : "generations"
  const url = new URL(normalizeOpenAIBaseURL(value, locale))
  const pathname = url.pathname.replace(/\/+$/, "")

  url.pathname = `${pathname}/images/${operation}`

  return url.toString()
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function toImageSrc(value: unknown, outputFormat: string) {
  const image = asString(value)

  if (!image) {
    return undefined
  }

  if (image.startsWith("data:image/") || image.startsWith("http://") || image.startsWith("https://")) {
    return image
  }

  return `data:image/${outputFormat};base64,${image}`
}

function collectImageFromRecord(record: UnknownRecord, outputFormat: string) {
  const src =
    toImageSrc(record.b64_json, outputFormat) ||
    toImageSrc(record.url, outputFormat) ||
    toImageSrc(record.image, outputFormat) ||
    toImageSrc(record.base64, outputFormat) ||
    toImageSrc(record.result, outputFormat)

  if (src) {
    return {
      revisedPrompt: asString(record.revised_prompt) || asString(record.revisedPrompt),
      src,
    } satisfies GeneratedImage
  }

  return undefined
}

function collectFromArray(value: unknown, outputFormat: string) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item): GeneratedImage[] => {
    const src = toImageSrc(item, outputFormat)

    if (src) {
      return [{ src }]
    }

    if (!isRecord(item)) {
      return []
    }

    const image = collectImageFromRecord(item, outputFormat)

    if (image) {
      return [image]
    }

    return [
      ...collectFromArray(item.data, outputFormat),
      ...collectFromArray(item.images, outputFormat),
      ...collectFromArray(item.output, outputFormat),
      ...collectFromArray(item.content, outputFormat),
    ]
  })
}

export function extractGeneratedImages(payload: unknown, outputFormat: string) {
  if (!isRecord(payload)) {
    return []
  }

  const image = collectImageFromRecord(payload, outputFormat)
  const images = [
    ...collectFromArray(payload.data, outputFormat),
    ...collectFromArray(payload.images, outputFormat),
    ...collectFromArray(payload.output, outputFormat),
    ...collectFromArray(payload.content, outputFormat),
  ]

  return image ? [image, ...images] : images
}

export function getImageApiError(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined
  }

  if (isRecord(payload.error)) {
    return asString(payload.error.message) || asString(payload.error.type)
  }

  return (
    asString(payload.error) ||
    asString(payload.message) ||
    asString(payload.msg) ||
    asString(payload.detail)
  )
}

export function getPayloadField(payload: unknown, key: string) {
  if (!isRecord(payload)) {
    return undefined
  }

  return payload[key]
}
