// 验证第二页 /remix（提示词套装版）：无 JS 错误 + 交互提示
const puppeteer = require("puppeteer-core")

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2600 })

  const errors = []
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`)
  })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })

  const results = {}

  // 1. 标题
  results.title = await page.evaluate(() => document.body.innerText.includes("Amazon 电商视觉提示词迁移"))

  // 2. 未填分析 Key 时点击「AI 改写全部」→ 应提示分析模块 API Key
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"))
    const target = buttons.find((b) => b.textContent.trim().includes("AI 改写全部"))
    if (target) target.click()
  })
  await new Promise((resolve) => setTimeout(resolve, 1000))
  results.keyToast = await page.evaluate(
    () => document.body.innerText.includes("分析模块") && document.body.innerText.includes("API Key")
  )

  // 3. 未填生图 Key 时点击「生图全部」→ 应提示生图模块 API Key
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"))
    const target = buttons.find((b) => b.textContent.includes("生图全部"))
    if (target) target.click()
  })
  await new Promise((resolve) => setTimeout(resolve, 1000))
  results.genKeyToast = await page.evaluate(
    () => document.body.innerText.includes("生图模块") && document.body.innerText.includes("API Key")
  )

  // 4. 导入多条：粘贴 2 条（空行分隔）→ 点击导入 → 条目数应为 2
  await page.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll("textarea"))
    const source = textareas[1] // 第一个是大粘贴框（在新产品信息之后？按 DOM 顺序找 placeholder 含“粘贴第一页跑通”的）
    const target = textareas.find((t) => t.placeholder.includes("粘贴第一页跑通的多条提示词"))
    if (!target) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    setter.call(target, "第一条提示词内容A\n\n第二条提示词内容B")
    target.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"))
    const target = buttons.find((b) => b.textContent.includes("导入为多条提示词"))
    if (target) target.click()
  })
  await new Promise((resolve) => setTimeout(resolve, 1000))
  results.importCount = await page.evaluate(() => {
    const body = document.body.innerText
    const match = body.match(/当前 (\d+) 条/)
    return match ? parseInt(match[1], 10) : 0
  })

  // 5. 返回链接
  results.navLink = await page.evaluate(() => !!document.querySelector('a[href="/"]'))

  console.log(`标题渲染: ${results.title ? "OK" : "FAIL"}`)
  console.log(`未填分析Key提示: ${results.keyToast ? "OK" : "FAIL"}`)
  console.log(`未填生图Key提示: ${results.genKeyToast ? "OK" : "FAIL"}`)
  console.log(`导入多条后条目数: ${results.importCount} (期望 2)`)
  console.log(`返回首页链接: ${results.navLink ? "OK" : "FAIL"}`)
  console.log(`JS错误数: ${errors.length}`)
  errors.slice(0, 5).forEach((e) => console.log(`  ${e}`))

  await browser.close()
  const failed =
    !results.title ||
    !results.keyToast ||
    !results.genKeyToast ||
    results.importCount !== 2 ||
    !results.navLink ||
    errors.length > 0
  process.exit(failed ? 1 : 0)
})()
