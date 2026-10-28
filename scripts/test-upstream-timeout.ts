import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { fetch as transportFetch } from "undici"
import OpenAI from "openai"
import { createUpstreamDispatcher, upstreamFetch, UPSTREAM_TIMEOUT_MS } from "../src/lib/upstream-fetch"
async function main() {
  let multipart = ""
  const server = createServer((request, response) => {
    if (request.method === "POST") {
      request.setEncoding("utf8")
      request.on("data", chunk => { multipart += chunk })
      request.on("end", () => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({data:[{b64_json:"dGVzdA=="}]})) })
    } else setTimeout(() => response.end("complete"), 1800)
  })
  server.listen(0, "127.0.0.1")
  await once(server,"listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing test address")
  const url = `http://127.0.0.1:${address.port}`
  const short = createUpstreamDispatcher(100)
  try {
    await assert.rejects(transportFetch(url,{dispatcher:short}))
    await assert.rejects(fetch(url,{dispatcher:short} as RequestInit))
    assert.equal(await (await upstreamFetch(url)).text(),"complete")
    assert.equal(UPSTREAM_TIMEOUT_MS,900000)
    const client = new OpenAI({apiKey:"test",baseURL:url,fetch:upstreamFetch,maxRetries:0})
    await client.images.edit({model:"test",prompt:"完整商品提示词",image:new File(["image-test"],"product.png",{type:"image/png"})})
    assert.ok(multipart.includes("product.png") && multipart.includes("image-test"))
    console.log("PASS: 短响应头超时复现；实际项目传输允许延迟响应；OpenAI SDK 原生 FormData 文件上传通过；响应头/响应体/SDK统一15分钟")
  } finally { await short.close(); server.closeAllConnections(); server.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
