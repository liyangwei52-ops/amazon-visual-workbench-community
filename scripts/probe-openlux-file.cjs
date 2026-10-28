const fs = require("node:fs")

async function main() {
  const [configPath, spreadsheetPath, productPath] = process.argv.slice(2)
  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/).map(line => line.trim())
  const after = label => {
    const i = lines.indexOf(label)
    if (i < 0) throw new Error("Missing config label: " + label)
    return lines.slice(i + 1).find(Boolean)
  }
  const key = after("Key")
  const endpoint = new URL(after("Api网址"))
  if (endpoint.hostname !== "api.openlux.ai" || endpoint.protocol !== "https:") throw new Error("Unexpected provider")
  const base = endpoint.href.replace(/\/+$/, "").replace(/\/v1$/, "")
  const body = {
    model: "gpt-5.6-sol",
    store: false,
    max_output_tokens: 1800,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "这是文件兼容性测试。请直接读取所附Excel和产品图，用中文列出：1.工作表名称；2.表格中前三个实际版位名称和一段原文；3.Excel内嵌参考图片是否实际可见，不能把附带产品图误当Excel图片，不可猜测；4.附带产品图是什么商品。不能读取的部分明确说明，不要生成策划。" },
        { type: "input_file", filename: "planning.xlsx", file_data: "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + fs.readFileSync(spreadsheetPath).toString("base64") },
        { type: "input_image", image_url: "data:image/jpeg;base64," + fs.readFileSync(productPath).toString("base64") }
      ]
    }]
  }
  const response = await fetch(base + "/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })
  const raw = (await response.text()).replaceAll(key, "[REDACTED]")
  let data
  try { data = JSON.parse(raw) } catch { data = { error: raw.slice(0,1000) } }
  const report = {
    model: body.model, status: response.status,
    output: data.output_text || data.output?.flatMap(item => item.content || []).map(item => item.text || "").join("\n"),
    error: data.error, usage: data.usage
  }
  fs.writeFileSync("verification/openlux-xlsx-probe.json", JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
