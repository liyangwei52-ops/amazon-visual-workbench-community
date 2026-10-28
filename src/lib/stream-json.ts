/** 大型图片结果按块传输，避免平台对缓冲响应的大小限制；客户端仍可 response.json()。 */
export function streamJson(value: unknown): Response {
  const json = JSON.stringify(value)
  const encoder = new TextEncoder()
  let offset = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= json.length) { controller.close(); return }
      // 避免切断 UTF-16 代理对，否则中英文之外的字符会损坏。
      let end = Math.min(offset + 64 * 1024, json.length)
      if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--
      controller.enqueue(encoder.encode(json.slice(offset, end)))
      offset = end
    },
  }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } })
}
