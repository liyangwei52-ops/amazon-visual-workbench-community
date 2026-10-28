/* 交互验证脚本：验证工作台关键交互逻辑（错误提示路径） */
const puppeteer = require("puppeteer-core")

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1600,2400"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 2400 })
    const errors = []
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`)
    })
    page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`))

    await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 60000 })

    // 1. 验证页面标题与关键文本
    const title = await page.title()
    console.log("TITLE:", title)

    const hasWorkbench = await page.evaluate(() => document.body.innerText.includes("Amazon 电商视觉工作台"))
    console.log("HAS_WORKBENCH:", hasWorkbench)

    // 2. 参考图计数是否 0/2（修正 OCR 疑虑）
    const refCount = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span"))
      return spans.map((s) => s.textContent).filter((t) => t && t.includes("/2")).slice(0, 5)
    })
    console.log("REF_COUNTS:", JSON.stringify(refCount))

    // 3. 点击「生成提示词」（无 Key）→ 期望 toast 错误
    const buttons = await page.$$("button")
    const analyzeBtn = null
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent)
      if (text && text.includes("生成提示词")) {
        await btn.click()
        break
      }
    }
    await new Promise((r) => setTimeout(r, 1500))
    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log("NO_KEY_TOAST:", bodyText.includes("请先填写 API Key") ? "OK" : "MISSING")

    // 4. 填入 Key 后点「生成提示词」（无产品图）→ 期望 toast 提示上传产品图
    await page.type('input[type="password"], input[placeholder="sk-..."]', "sk-test-123456")
    await new Promise((r) => setTimeout(r, 500))
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent)
      if (text && text.includes("生成提示词")) {
        await btn.click()
        break
      }
    }
    await new Promise((r) => setTimeout(r, 1500))
    const bodyText2 = await page.evaluate(() => document.body.innerText)
    console.log("NO_PRODUCT_TOAST:", bodyText2.includes("请先上传【我方产品图】") ? "OK" : "MISSING")

    // 5. 点击「新增请求」→ 请求数 +1
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent)
      if (text && text.includes("新增请求")) {
        await btn.click()
        break
      }
    }
    await new Promise((r) => setTimeout(r, 800))
    const requestCount = await page.evaluate(() => {
      const text = document.body.innerText
      return (text.match(/单独请求/g) || []).length
    })
    console.log("REQUEST_COUNT_AFTER_ADD:", requestCount)

    // 6. 截图全页
    await page.screenshot({ path: "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\preview-full.png", fullPage: true })

    console.log("JS_ERRORS:", errors.length ? errors.join("\n") : "NONE")
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("SCRIPT FAILED:", err)
  process.exit(1)
})
