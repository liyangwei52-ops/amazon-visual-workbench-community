import { DEFAULT_OPENAI_BASE_URL, normalizeOpenAIBaseURL } from "@/lib/image-request"

export class EndpointNotAllowedError extends Error {}

/** Only configured HTTPS origins may receive requests from the server proxy. */
export function allowedApiBaseURL(value: string): string {
  let baseURL: string
  try {
    baseURL = normalizeOpenAIBaseURL(value)
  } catch {
    throw new EndpointNotAllowedError("API 地址无效，请填写允许列表中的 HTTPS 地址。")
  }
  const url = new URL(baseURL)
  const configured = (process.env.ALLOWED_API_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .flatMap((origin) => {
      try {
        const parsed = new URL(origin)
        return parsed.protocol === "https:" && parsed.origin === origin.replace(/\/$/, "")
          ? [parsed.origin]
          : []
      } catch {
        return []
      }
    })
  const allowed = new Set([new URL(DEFAULT_OPENAI_BASE_URL).origin, ...configured])

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !allowed.has(url.origin)
  ) {
    throw new EndpointNotAllowedError("API 地址不在服务端允许列表中。请联系管理员配置 ALLOWED_API_ORIGINS（仅 HTTPS 源地址）。")
  }
  return baseURL
}
