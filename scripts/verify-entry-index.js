/* 验证：删除中间条目后保存 → 载入编辑时 01 对应「提示词 1」（序号自动重排）
   流程：新增2条 → 填2条提示词 → 删除第1条 → 保存 → 载入编辑 → 断言 01 标题=提示词 1 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const SUITE_NAME = "编号验证套装"

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2600 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(800)

  const stats = () => page.evaluate(() => ({
    titleInputs: [...document.querySelectorAll("input")].filter((i) => i.value.startsWith("提示词")).map((i) => i.value),
    textareas: document.querySelectorAll("textarea").length,
    delButtons: [...document.querySelectorAll("button[aria-label='删除本条']")].length,
  }))

  // 填名称
  await page.evaluate((value) => {
    const input = document.querySelector('input[placeholder="例如：玫瑰金岁数蜂窝"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }, SUITE_NAME)
  await wait(300)

  // 新增一条 → 共 2 条
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("新增一条"))
    if (b) b.click()
  })
  await wait(600)
  console.log("新增后状态:", JSON.stringify(await stats()))

  // 填 2 条提示词（按 textarea 序号）
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const ts = document.querySelectorAll("textarea")
    ts.forEach((t, i) => {
      setter.call(t, `编号测试内容-${i + 1}`)
      t.dispatchEvent(new Event("input", { bubbles: true }))
    })
  })
  await wait(400)

  // 删除第 1 条
  await page.evaluate(() => {
    const d = document.querySelector("button[aria-label='删除本条']")
    if (d) d.click()
  })
  await wait(600)
  console.log("删除后状态:", JSON.stringify(await stats()))

  // 保存
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("保存套装修改"))
    if (b) b.click()
  })
  await wait(900)

  // 存储内容
  const stored = await page.evaluate((n) => {
    const suites = JSON.parse(localStorage.getItem("amazon-workbench.suites") || "[]")
    const s = suites.find((x) => x.name === n)
    return s ? { entries: s.entries.map((e) => e.title), n: s.entries.length } : null
  }, SUITE_NAME)
  console.log("保存后存储:", JSON.stringify(stored))

  // 载入编辑 → 01 标题
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("载入编辑"))
    if (b) b.click()
  })
  await wait(900)
  const after = await stats()
  console.log("载入编辑后:", JSON.stringify(after))
  const first = after.titleInputs[0]
  console.log("01 对应「提示词 1」:", first === "提示词 1", `(实际: ${JSON.stringify(first)})`)
  console.log("JS 错误数:", errors.length)

  await page.evaluate((n) => {
    const suites = JSON.parse(localStorage.getItem("amazon-workbench.suites") || "[]").filter((s) => s.name !== n)
    localStorage.setItem("amazon-workbench.suites", JSON.stringify(suites))
  }, SUITE_NAME)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
