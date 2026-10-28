import { NextResponse } from "next/server"

/** Public anonymous uploads are disabled. Planner documents are parsed in the browser. */
export async function POST() {
  return NextResponse.json(
    { error: "公开上传已关闭。请在一键策划页上传文档，由浏览器本地读取。" },
    { status: 410 }
  )
}
