import assert from "node:assert/strict"
import { streamJson } from "../src/lib/stream-json"
async function main() {
  const value = { prompt: "中".repeat(65523) + "🎨保留原文", images:[{src:"data:image/png;base64,"+"a".repeat(6*1024*1024)}] }
  const response=streamJson(value)
  assert.equal(response.headers.get("Content-Length"),null)
  assert.equal(response.headers.get("Cache-Control"),"no-store")
  assert.deepEqual(await response.json(),value)
  console.log("PASS: 超过6MB的图片JSON分块传输，中文与跨块emoji完整，客户端JSON兼容且禁止缓存")
}
main().catch(error=>{console.error(error);process.exitCode=1})
