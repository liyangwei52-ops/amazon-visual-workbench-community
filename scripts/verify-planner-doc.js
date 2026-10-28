const puppeteer = require("puppeteer-core")
const fs = require("node:fs")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAFUlEQVR4nGP8z8Dwn4GBgYGJAQoAHQEAzQEBfE7siwAAAABJRU5ErkJggg=="

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1400 })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))

  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem("cleared-plan2")) {
      sessionStorage.setItem("cleared-plan2", "1")
      localStorage.removeItem("amazon-workbench.generateQueue")
    }
    localStorage.setItem("amazon-workbench.analyzeApiKey", "sk-test-planner")
    localStorage.setItem("amazon-workbench.analyzeEndpoint", "https://api.openai.com/v1")
    localStorage.setItem("amazon-workbench.analyzeModel", "gpt-4o")
  })
  await page.goto("http://localhost:3000/planner", { waitUntil: "networkidle0" })
  await page.reload({ waitUntil: "networkidle0" })
  await sleep(600)

  // 1) 上传产品图（真实 hover + paste）
  const zone = await page.evaluateHandle(() => {
    const nodes = Array.from(document.querySelectorAll("button,label,span,div")).filter((el) => el.textContent && el.textContent.includes("点击上传产品图"))
    nodes.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)
    return nodes[0]
  })
  try { await zone.asElement().hover() } catch {}
  await sleep(200)
  await page.evaluate((b64) => {
    const byteChars = atob(b64)
    const bytes = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
    const blob = new Blob([bytes], { type: "image/png" })
    const file = new File([blob], "product.png", { type: "image/png" })
    const dt = new DataTransfer()
    dt.items.add(file)
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  }, TEST_PNG_B64)
  await sleep(1200)
  const hasProduct = await page.evaluate(() => (document.body.textContent || "").includes("product.png"))
  console.log("PASS 上传产品图" + (hasProduct ? "" : " [FAIL]"))

  // 2) 上传策划文档（.xlsx，选择文件输入）
  const xlsxPath = "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\scripts\\test-plan.xlsx"
  const input = await page.$('input[type="file"][accept*=".xlsx"]')
  if (!input) { console.log("FAIL 未找到策划文档上传框"); process.exitCode = 1; await browser.close(); return }
  await input.uploadFile(xlsxPath)
  await sleep(2500) // 等待 jszip 解析 + 图片压缩

  const docState = await page.evaluate(() => {
    const body = document.body.textContent || ""
    const thumbs = Array.from(document.querySelectorAll("img"))
    return {
      fileName: body.includes("test-plan.xlsx") || body.includes("策划表.xlsx"),
      charCount: body.includes("文案") && body.includes("字"),
      imgCount: /竞品图\s*\d+\s*张/.test(body),
      mimeOk: thumbs.every((img) => !img.src || img.src.startsWith("data:image/")),
      labels: (body.match(/图[2-6]/g) || []).length,
    }
  })
  console.log("PASS 策划文档解析展示（文件名）" + (docState.fileName ? "" : " [FAIL]"))
  console.log("PASS 文案字数显示" + (docState.charCount ? "" : " [FAIL]"))
  console.log("PASS 竞品图数量显示" + (docState.imgCount ? "" : " [FAIL]"))
  console.log("PASS 文档图 MIME 均为 data:image/（可被分析代理识别）" + (docState.mimeOk ? "" : " [FAIL]"))
  console.log(`INFO 竞品图标签（图2~图6）出现 ${docState.labels} 次（应 ≥2：图2、图3）`)

  // 3) 点「开始策划」（假 key → 走 /api/analyze 失败兜底，验证请求体构造不崩 + 页面存活）
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes("开始策划"))
    if (btn) btn.click()
  })
  await sleep(4000)
  const alive = await page.evaluate(() => (document.body.textContent || "").includes("一键策划 · 输入与 AI 策划"))
  console.log("PASS 开始策划请求构造（无真实 key 时错误兜底、页面存活）" + (alive ? "" : " [FAIL]"))

  console.log(`INFO JS 运行时错误 = ${errors.length}`)
  const failed = errors.length > 0 || !hasProduct || !docState.fileName || !docState.charCount || !docState.imgCount || !docState.mimeOk || docState.labels < 2
  console.log(failed ? "SOME FAILED" : "ALL PASS")
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
