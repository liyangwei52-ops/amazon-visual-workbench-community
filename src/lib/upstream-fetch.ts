import { Agent } from "undici"

export const UPSTREAM_TIMEOUT_MS = 15 * 60 * 1000

/** SDK 的 timeout 不会覆盖 Node fetch 默认的 300 秒响应头超时。 */
export function createUpstreamDispatcher(timeout = UPSTREAM_TIMEOUT_MS) {
  return new Agent({ headersTimeout: timeout, bodyTimeout: timeout, connectTimeout: 30_000 })
}

const dispatcher = createUpstreamDispatcher()

export const upstreamFetch: typeof fetch = (input, init) => {
  // 使用运行时原生 fetch/FormData，保持 OpenAI SDK 文件上传预检兼容。
  return fetch(input, {
    ...init,
    dispatcher,
  } as RequestInit & { dispatcher: Agent })
}
