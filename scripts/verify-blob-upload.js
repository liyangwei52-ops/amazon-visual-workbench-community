/**
 * 端到端验证：Vercel Blob 客户端直传（大策划文档绕过 4.5MB 限制）
 * 1. 生成 8MB 模拟 xlsx（远超线上请求体限制）
 * 2. 用 @vercel/blob/client 的 upload() 走 /api/blob-upload 获取 clientToken 并直传 Blob 存储
 * 3. 断言返回 public URL（https://*.public.blob.vercel-storage.com）
 * 4. 用该 URL 直接请求 /api/analyze（http URL 透传），断言服务端接受且按文档校验通过
 */
const { upload } = require("@vercel/blob/client")
const fs = require("fs")

const BASE = process.env.BASE || "http://localhost:3000"

async function main() {
  // 1. 构造 8MB 测试文件（模拟策划文档；xlsx 本质是 zip，随机字节足够测试体积路径）
  const size = 8 * 1024 * 1024
  const buf = Buffer.alloc(size)
  // 写入可读头便于人工确认
  buf.write("PK\x03\x04", 0)
  for (let i = 0; i < size; i += 4096) buf.writeInt32LE(i, i % (size - 4))
  const file = new File([buf], "plan-8mb-test.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  console.log("file size:", file.size, "bytes")

  // 2. 客户端直传（内部先请求 /api/blob-upload 换 clientToken，再 PUT 到 Blob 存储，不经函数 body）
  console.log("uploading via", BASE + "/api/blob-upload", "...")
  const blob = await upload("plan-8mb-test.xlsx", file, {
    access: "public",
    handleUploadUrl: BASE + "/api/blob-upload",
  })
  console.log("blob.url:", blob.url)
  console.log("blob.contentType:", blob.contentType)
  console.log("blob.pathname:", blob.pathname)

  // 3. 断言 public URL
  if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(blob.url)) {
    throw new Error("FAIL: blob.url 不是 public blob URL: " + blob.url)
  }
  console.log("PASS: public blob URL")

  // 4. http URL 透传给 /api/analyze（用假 key 断言校验层接受该 URL，不返回 400 校验错误）
  const body = JSON.stringify({
    endpoint: "https://api.openai.com/v1",
    apiKey: "sk-fake",
    model: "gpt-4o",
    systemPrompt: "x",
    userText: "x",
    images: [
      { dataUrl: blob.url, role: "reference", index: 2 },
    ],
  })
  const res = await fetch(BASE + "/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
  console.log("/api/analyze status:", res.status)
  const txt = await res.text()
  if (res.status === 400) {
    throw new Error("FAIL: /api/analyze 拒绝了 blob URL: " + txt.slice(0, 300))
  }
  // 假 key 预期走到上游报 401/500；只要不是 400 校验拒绝即视为 URL 透传通过
  if (res.status === 413) throw new Error("FAIL: /api/analyze 返回 413")
  console.log("PASS: /api/analyze 接受 blob public URL（status", res.status, "）")
  console.log("DONE")
}

main().catch((e) => {
  console.error("FAIL:", e.message)
  process.exit(1)
})
