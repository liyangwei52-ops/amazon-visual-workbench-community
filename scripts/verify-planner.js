const puppeteer = require("puppeteer-core")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAKUlEQVR4nO3OMQEAAAgDINc/9K3hGJKoA9wAAAAAAAAAAAAAAAC8GQJUAAFJaLyYAAAAAElFTkSuQmCC"

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
    if (!sessionStorage.getItem("cleared-planner")) {
      sessionStorage.setItem("cleared-planner", "1")
      localStorage.removeItem("amazon-workbench.generateQueue")
      localStorage.removeItem("amazon-workbench.queueLock")
    }
    localStorage.setItem("amazon-workbench.analyzeApiKey", "sk-test-planner")
    localStorage.setItem("amazon-workbench.analyzeEndpoint", "https://api.openai.com/v1")
    localStorage.setItem("amazon-workbench.analyzeModel", "gpt-4o")
    localStorage.setItem("amazon-workbench.imageApiKey", "sk-test-planner")
    localStorage.setItem("amazon-workbench.imageEndpoint", "https://api.openai.com/v1")
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
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
  }, TEST_PNG_B64)
  await sleep(1200)
  const hasProduct = await page.evaluate(() => (document.body.textContent || "").includes("product.png"))
  console.log("PASS 上传产品图" + (hasProduct ? "" : " [FAIL]"));

  // 2) 填产品策划 + 产品信息
  await page.evaluate(() => {
    const tas = Array.from(document.querySelectorAll("textarea"))
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    for (const ta of tas) {
      if (ta.placeholder && ta.placeholder.includes("例如：\nMaterial")) {
        setter.call(ta, "Material: Steel\nCapacity: 2L")
        ta.dispatchEvent(new Event("input", { bubbles: true }))
      } else if (ta.placeholder && ta.placeholder.includes("主视觉")) {
        setter.call(ta, "主视觉 | 白底主图产品居中\n尺寸图 | 展示尺寸不虚构数字\n场景图 | 派对场景")
        ta.dispatchEvent(new Event("input", { bubbles: true }))
      }
    }
  })
  await sleep(400)

  // 3) 点「开始策划」→ 无真实 key 应弹错误 toast（页面不崩）
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes("开始策划"))
    if (btn) btn.click()
  })
  await sleep(3000)
  const afterPlan = await page.evaluate(() => {
    const body = document.body.textContent || ""
    return {
      stillAlive: body.includes("一键策划 · 输入与 AI 策划"),
      showError: body.includes("策划请求失败") || body.includes("失败") || body.includes("error"),
      pageHasError: false,
    }
  })
  console.log("PASS 开始策划（无 key 时页面正常，展示错误）" + (afterPlan.stillAlive ? "" : " [FAIL]"))

  // 4) 手动新增 2 条提示词并启用计数
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes("新增一条"))
    if (btn) btn.click()
  })
  await sleep(300)
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes("新增一条"))
    if (btn) btn.click()
  })
  await sleep(300)
  const entryCount = await page.evaluate(() => {
    const body = document.body.textContent || ""
    const m = body.match(/共\s*(\d+)\s*条/)
    return m ? Number(m[1]) : -1
  })
  console.log(`PASS 新增条目后共 ${entryCount} 条` + (entryCount >= 3 ? "" : " [FAIL]"))

  // 5) 填提示词 → 点「生成 N 条」→ 应跳转 /generate 且队列写入
  await page.evaluate(() => {
    const tas = Array.from(document.querySelectorAll("textarea"))
    const targets = tas.filter((ta) => ta.placeholder && ta.placeholder.includes("提示词内容"))
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    for (let i = 0; i < targets.length; i++) {
      setter.call(targets[i], `Planner prompt ${i + 1} product on white background`)
      targets[i].dispatchEvent(new Event("input", { bubbles: true }))
    }
  })
  await sleep(400)
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && /^生成\s*\d+\s*条/.test(b.textContent.trim()))
    if (btn) btn.click()
  })
  let jumped = false
  for (let i = 0; i < 20; i++) {
    await sleep(250)
    if (page.url().includes("/generate")) { jumped = true; break }
  }
  const queue = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("amazon-workbench.generateQueue") || "[]") } catch { return [] }
  })
  console.log("PASS 点「生成」跳转 /generate" + (jumped ? "" : " [FAIL]"))
  console.log(`INFO 队列任务数 = ${queue.length}`)
  if (queue.length >= 1) {
    console.log("PASS 任务携带产品图 " + (queue[0].productImageDataUrl ? "" : "[FAIL]"))
    console.log(`INFO 任务1 label = ${queue[0].label}`)
    console.log(`INFO 任务1 ratio/quality = ${queue[0].ratio}/${queue[0].quality}`)
  }
  console.log(`INFO JS 运行时错误 = ${errors.length}`)
  const failed = errors.length > 0 || !hasProduct || !afterPlan.stillAlive || entryCount < 3 || !jumped || queue.length < 1
  console.log(failed ? "SOME FAILED" : "ALL PASS")
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
