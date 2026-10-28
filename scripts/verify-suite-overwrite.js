/* 验证：同名保存直接覆盖（列表不新增）、不同名保存新建 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2600 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  const countInStorage = (name) => page.evaluate((n) => {
    const suites = JSON.parse(localStorage.getItem("amazon-workbench.suites") || "[]")
    return { total: suites.length, sameName: suites.filter((s) => s.name === n).length }
  }, name)

  // 填提示词文本（校验要求至少一条非空提示词）
  const fillPrompt = () => page.evaluate(() => {
    const t = document.querySelector("textarea[placeholder*='提示词文本']")
    if (!t) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    setter.call(t, "覆盖测试提示词内容")
    t.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await fillPrompt()
  await new Promise((r) => setTimeout(r, 200))

  // 1. 第三页保存"同名覆盖测试"（1 条）
  await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle2", timeout: 60000 })
  await new Promise((r) => setTimeout(r, 500))
  await page.evaluate((value) => {
    const input = document.querySelector('input[placeholder="例如：玫瑰金岁数蜂窝"]')
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }, "同名覆盖测试")
  await new Promise((r) => setTimeout(r, 200))
  await fillPrompt()
  await new Promise((r) => setTimeout(r, 200))
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("保存套装修改"))
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  console.log("第一次保存:", JSON.stringify(await countInStorage("同名覆盖测试")))

  // 2. 同名再保存一次 → 应覆盖，数量不变
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("保存套装修改"))
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  console.log("同名第二次保存:", JSON.stringify(await countInStorage("同名覆盖测试")))

  // 3. 改名"不同名新建测试"保存 → 新建一条
  await page.evaluate((value) => {
    const input = document.querySelector('input[placeholder="例如：玫瑰金岁数蜂窝"]')
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }, "不同名新建测试")
  await new Promise((r) => setTimeout(r, 200))
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("保存套装修改"))
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  console.log("不同名保存:", JSON.stringify(await countInStorage("不同名新建测试")))

  console.log("JS 错误数:", errors.length)

  // 清理
  await page.evaluate(() => {
    const suites = JSON.parse(localStorage.getItem("amazon-workbench.suites") || "[]")
      .filter((s) => !["同名覆盖测试", "不同名新建测试"].includes(s.name))
    localStorage.setItem("amazon-workbench.suites", JSON.stringify(suites))
  })
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
