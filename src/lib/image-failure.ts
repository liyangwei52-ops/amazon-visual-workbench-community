import { getImageApiError } from "./image-request"

export type ImageFailureOutcome = "failed" | "interrupted"

function isQuotaFailure(message: string): boolean {
  return /insufficient[_ -]?quota|quota.{0,30}(?:exceed|not[_ -]?(?:enough|sufficient)|insufficient)|insufficient.{0,20}(?:credit|balance)|(?:余额|额度)不足/i.test(message)
}

/** 上游明确拒绝请求时可确认失败；网关超时或断线仍需人工核查。 */
export function imageFailureOutcome(status: number, message: string): ImageFailureOutcome {
  if (status >= 400 && status < 500 && status !== 408) return "failed"
  if (isQuotaFailure(message)) return "failed"
  if (/load is saturated|upstream.*saturat|no available channel|no available provider|rate[_ -]?limit|insufficient[_ -]?quota|quota.{0,20}exceed|invalid.{0,10}api.{0,10}key|incorrect.{0,10}api.{0,10}key|model[_ -]?not[_ -]?found|unsupported.{0,20}(?:model|size|parameter)|余额不足|无可用渠道|负载已满|渠道不可用/i.test(message)) {
    return "failed"
  }
  return "interrupted"
}

export function readImageFailure(status: number, payload: unknown) {
  const raw = getImageApiError(payload) || "生图请求失败（HTTP " + status + "）"
  const declared = payload && typeof payload === "object" && "outcome" in payload ? payload.outcome : undefined
  const outcome = declared === "failed" || declared === "interrupted"
    ? declared
    : imageFailureOutcome(status, raw)
  const message = isQuotaFailure(raw)
    ? "服务商账户余额或额度不足，本次请求被拒绝。请到当前服务商核查余额，处理后再手动重试；系统不会自动重发。\n上游返回：" + raw
    : /load is saturated|upstream.*saturat/i.test(raw)
    ? "生图服务当前负载已满，请稍后重试。\n上游返回：" + raw
    : raw
  return { outcome, message }
}
