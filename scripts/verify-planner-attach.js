const puppeteer = require("puppeteer-core")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAFUlEQVR4nGP8z8Dwn4GBgYGJAQoAHQEAzQEBfE7siwAAAABJRU5ErkJggg=="

const MOCK_PLAN_OUTPUT = `【提示词 1｜主视觉】生成一张 Amazon 主图，1:1 方形，纯白背景，图1 产品居中完整展示，真实阴影。
【提示词 2｜尺寸图】生成一张 Amazon 尺寸信息图，图1 产品为主，虚线标注测量走向，不生成冗余数字。
【提示词 3｜场景图】生成一张派对场景生活方式图，图1 产品置于桌面中央，暖色灯光，人物手部可入镜。`

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1600 })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))

  // 页面内 fetch 拦截：捕获 /api/analyze 请求体，返回固定策划输出
  await page.evaluateOnNewDocument((mockOutput) => {
    const origFetch = window.fetch.bind(window)
    window.__capturedAnalyzeBody = null
    window.fetch = async (url, options) => {
      if (typeof url === "string" && url.includes("/api/analyze") && options && options.method === "POST") {
        window.__capturedAnalyzeBody = options.body
        return new Response(
          JSON.stringify({ endpoint: "mock", model: "gpt-4o", prompt: mockOutput }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }
      return origFetch(url, options)
    }
  }, MOCK_PLAN_OUTPUT)

  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem("cleared-plan-attach")) {
      sessionStorage.setItem("cleared-plan-attach", "1")
      localStorage.removeItem("amazon-workbench.generateQueue")
    }
    localStorage.setItem("amazon-workbench.analyzeApiKey", "sk-test-attach")
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

  // 2) 上传策划文档（.docx 原样附加，不做解析）
  const docxPath = "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\scripts\\test-plan.docx"
  const input = await page.$('input[type="file"][accept*=".docx"]')
  if (!input) { console.log("FAIL 未找到策划文档上传框"); process.exitCode = 1; await browser.close(); return }
  await input.uploadFile(docxPath)
  await sleep(1500)

  const docState = await page.evaluate(() => {
    const body = document.body.textContent || ""
    return {
      fileName: body.includes("策划表.docx") || body.includes("test-plan.docx"),
      noParsePreview: !(body.includes("文案") && body.includes("字")) && !/竞品图\s*\d+\s*张/.test(body),
      attachHint: body.includes("原样") && body.includes("发给"),
      kbShown: /[\d.]+\s*KB|MB/.test(body),
    }
  })
  console.log("PASS 策划文档附加展示（文件名）" + (docState.fileName ? "" : " [FAIL]"))
  console.log("PASS 不再显示解析预览（文案字数/竞品图缩略）" + (docState.noParsePreview ? "" : " [FAIL]"))
  console.log("PASS 显示「原样发给模型」提示" + (docState.attachHint ? "" : " [FAIL]"))
  console.log("PASS 显示文件大小" + (docState.kbShown ? "" : " [FAIL]"))

  // 3) 点「开始策划」→ 断言请求体：产品图 + 文档原文件透传，不含解析文本
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes("开始策划"))
    if (btn) btn.click()
  })
  await sleep(3500)

  const captured = await page.evaluate(() => {
    const raw = window.__capturedAnalyzeBody
    return raw ? JSON.parse(raw) : null
  })
  const imgs = captured?.images || []
  const img1 = imgs[0] || {}
  const img2 = imgs[1] || {}
  const userText = captured?.userText || ""
  console.log("PASS 请求携带图片条目 " + (imgs.length === 2 ? `（${imgs.length} 个）` : `（${imgs.length} 个）`) + (imgs.length === 2 ? "" : " [FAIL]"))
  console.log("PASS 图1 为产品图（data:image）" + (img1.dataUrl?.startsWith("data:image/") ? "" : " [FAIL]"))
  console.log("PASS 图2 为策划文档原文件（data:application）" + (img2.dataUrl?.startsWith("data:application/") ? "" : " [FAIL]"))
  console.log("PASS 文档 MIME 为 docx" + (img2.dataUrl?.includes("wordprocessingml.document") ? "" : " [FAIL]"))
  console.log("PASS 请求不含解析出的文案文本" + (!userText.includes("【策划文档文案】") && !userText.includes("白底主图，产品居中") ? "" : " [FAIL]"))
  console.log("PASS 请求含文档说明（图2 为策划文档原文件）" + (userText.includes("策划文档原文件") ? "" : " [FAIL]"))

  // 4) 自动分发到提示词框（3 条，标题为 AI 版位名）
  const cards = await page.evaluate(() => {
    const body = document.body.textContent || ""
    return {
      has1: body.includes("主视觉"),
      has2: body.includes("尺寸图"),
      has3: body.includes("场景图"),
      promptLen: Array.from(document.querySelectorAll("textarea")).map((t) => t.value.length),
    }
  })
  console.log("PASS 自动分发 3 条提示词卡" + (cards.has1 && cards.has2 && cards.has3 ? "" : " [FAIL]"))
  console.log("INFO 提示词框字符数: " + JSON.stringify(cards.promptLen))
  console.log("PASS 提示词框已填入内容" + (cards.promptLen.some((n) => n > 20) ? "" : " [FAIL]"))

  console.log(`INFO JS 运行时错误 = ${errors.length}`)
  const failed =
    errors.length > 0 ||
    !hasProduct ||
    !docState.fileName ||
    !docState.noParsePreview ||
    !docState.attachHint ||
    !docState.kbShown ||
    !img1.dataUrl?.startsWith("data:image/") ||
    !img2.dataUrl?.startsWith("data:application/") ||
    !(cards.has1 && cards.has2 && cards.has3)
  console.log(failed ? "SOME FAILED" : "ALL PASS")
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
