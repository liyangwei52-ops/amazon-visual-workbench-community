// 端到端验证：保存套装（第三页）→ 第二页调用 → 逐条对应提示词框（不混在一起）
const puppeteer = require("puppeteer-core")

const SUITE_NAME = "E2E测试套装"

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

  const results = {}

  // 1. 第三页：填写套装（5 条）并保存
  await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle2", timeout: 60000 })
  await new Promise((resolve) => setTimeout(resolve, 500))

  const setName = async (text) => {
    await page.evaluate((value) => {
      const input = document.querySelector('input[placeholder="例如：玫瑰金岁数蜂窝"]')
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }, text)
  }
  await setName(SUITE_NAME)

  // 新增到 5 条（默认 1 条）
  for (let i = 1; i < 5; i += 1) {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"))
      const target = buttons.find((b) => b.textContent.includes("新增一条"))
      if (target) target.click()
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  // 填 5 条提示词
  await page.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll("textarea[placeholder*='提示词文本']"))
    textareas.forEach((textarea, index) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
      setter.call(textarea, `第${index + 1}条独有内容-测试${index + 1}`)
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 300))

  // 保存
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"))
    const target = buttons.find((b) => b.textContent.includes("保存套装修改"))
    if (target) target.click()
  })
  await new Promise((resolve) => setTimeout(resolve, 1200))
  results.suiteSaved = await page.evaluate(
    (suiteName) => document.body.innerText.includes(suiteName) && document.body.innerText.includes("套装·5条"),
    SUITE_NAME
  )

  // 2. 第二页：载入套装 → 5 条对应 5 个提示词框
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await new Promise((resolve) => setTimeout(resolve, 600))

  // 刷新列表
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"))
    const target = buttons.find((b) => b.textContent.includes("刷新列表"))
    if (target) target.click()
  })
  await new Promise((resolve) => setTimeout(resolve, 800))

  // 通过 Select 选择套装：Select 是 shadcn 风格，直接调用 onValueChange 较难；
  // 改用 localStorage 标记 loadSuiteId 走自动载入路径（等价于「在第二页使用」）
  await page.evaluate((suiteName) => {
    const raw = localStorage.getItem("amazon-workbench.suites") || "[]"
    const suites = JSON.parse(raw)
    const target = suites.find((suite) => suite.name === suiteName)
    if (target) localStorage.setItem("amazon-workbench.loadSuiteId", target.id)
  }, SUITE_NAME)
  await page.reload({ waitUntil: "networkidle2" })
  await new Promise((resolve) => setTimeout(resolve, 1200))

  results.loaded = await page.evaluate(
    (suiteName) => {
      const body = document.body.innerText
      return body.includes(suiteName) && body.includes("逐条对应提示词框")
    },
    SUITE_NAME
  )

  // 检查 5 个提示词框内容：逐条独立（第 i 框只含自己的内容）
  results.entryCount = await page.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll("textarea[placeholder*='提示词内容']"))
    return textareas.length
  })

  results.entriesSeparate = await page.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll("textarea[placeholder*='提示词内容']"))
    if (textareas.length !== 5) return false
    const contents = textareas.map((t) => t.value)
    // 每条只含自身内容，且不含其他条内容
    return contents.every((content, index) => {
      const own = content.includes(`第${index + 1}条独有内容`)
      const others = contents.some((other, otherIndex) => otherIndex !== index && other.includes(`第${index + 1}条独有内容`))
      return own && !others
    })
  })

  console.log(`第三页保存套装: ${results.suiteSaved ? "OK" : "FAIL"}`)
  console.log(`第二页自动载入套装: ${results.loaded ? "OK" : "FAIL"}`)
  console.log(`提示词框数量: ${results.entryCount} (期望 5)`)
  console.log(`5 条提示词逐条独立不混: ${results.entriesSeparate ? "OK" : "FAIL"}`)
  console.log(`JS错误数: ${errors.length}`)
  errors.slice(0, 5).forEach((e) => console.log(`  ${e}`))

  // 清理测试数据
  await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle2", timeout: 60000 })
  await page.evaluate((suiteName) => {
    const raw = localStorage.getItem("amazon-workbench.suites") || "[]"
    const suites = JSON.parse(raw).filter((suite) => suite.name !== suiteName)
    localStorage.setItem("amazon-workbench.suites", JSON.stringify(suites))
  }, SUITE_NAME)

  await browser.close()
  const failed =
    !results.suiteSaved || !results.loaded || results.entryCount !== 5 || !results.entriesSeparate || errors.length > 0
  process.exit(failed ? 1 : 0)
})()
