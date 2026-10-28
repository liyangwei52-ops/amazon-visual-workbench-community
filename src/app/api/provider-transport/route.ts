import { allowedApiBaseURL, EndpointNotAllowedError } from "@/lib/server-api-endpoint"

export async function POST(request: Request) {
  try {
    const body = await request.json() as { endpoint?: unknown }
    const baseURL = allowedApiBaseURL(typeof body?.endpoint === "string" ? body.endpoint : "")
    const url = new URL(baseURL)
    // OpenLux 的浏览器跨域接口已验证；只对管理员已配置的精确源地址启用。
    const direct = process.env.VERCEL === "1" && url.origin === "https://api.openlux.ai" && url.pathname.replace(/\/$/, "") === "/v1"
    return Response.json({ mode: direct ? "direct" : "proxy", baseURL }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: error instanceof EndpointNotAllowedError ? error.message : "无法校验服务商地址", outcome: "failed" }, { status: 400 })
  }
}
