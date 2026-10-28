export type ImageTransportFailure = { phase: "connect" | "response"; code: string }

const CONNECTION_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED",
  "ENETUNREACH", "EHOSTUNREACH", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
])

/** 在 SDK 把底层连接错误统一改写为 Request timed out 之前保存错误代码。 */
export function inspectImageTransportError(error: unknown): ImageTransportFailure | undefined {
  const pending: unknown[] = [error]
  const seen = new Set<object>()
  let fallback: ImageTransportFailure | undefined
  while (pending.length && seen.size < 20) {
    const value = pending.shift()
    if (!value || typeof value !== "object" || seen.has(value)) continue
    seen.add(value)
    const record = value as { code?: unknown; cause?: unknown; errors?: unknown[] }
    if (typeof record.code === "string" && /^[A-Z0-9_]{1,60}$/.test(record.code)) {
      if (CONNECTION_CODES.has(record.code)) return { phase: "connect", code: record.code }
      fallback ||= { phase: "response", code: record.code }
    }
    pending.push(record.cause)
    if (Array.isArray(record.errors)) pending.push(...record.errors)
  }
  return fallback
}

export function describeImageConnectionFailure(failure: ImageTransportFailure | undefined, timedOut: boolean, elapsedMs: number) {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000))
  const detail = (failure ? failure.code + "，" : "") + "用时 " + seconds + " 秒"
  if (failure?.phase === "connect") {
    return {
      outcome: "failed" as const,
      error: "连接生图服务失败（" + detail + "）。连接未建立，尚未提交生图任务；请核对生图 API 地址与网络。",
    }
  }
  return {
    outcome: "interrupted" as const,
    error: (timedOut ? "等待生图结果超时" : "与生图服务的连接中断") + "（" + detail + "），尚未收到上游的最终结果。",
  }
}
