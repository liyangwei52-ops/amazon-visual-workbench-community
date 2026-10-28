/** Keep provider details/request IDs while explaining an upstream timeout. Never retries. */
export function analysisFailureMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  if (/upstream\s+(?:service|request)[^\n]*(?:timed\s*out|timeout)/i.test(message)) {
    return `服务商等待超时，未收到完整分析结果。请先核查服务商记录，再手动重试；系统不会自动重发。\n上游原文：${message}`
  }
  return message
}
