/* 用 puppeteer 原生 click 完整模拟：选「自定义尺寸」→ 输入框出现 → 可输入 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1800 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 第一个条目的输出比例 trigger（1:1 · 方形）
  const triggers = await page.$$('[data-slot="select-trigger"]')
  const ratioTrigger = triggers[1] // 顺序：分析模型、生图模型、条目输出比例、清晰度、数量…用文本定位更稳
  const ratioText = await ratioTrigger.evaluate((el) => el.textContent.trim())
  console.log("输出比例 trigger:", ratioText)

  // 打开比例菜单
  await ratioTrigger.click()
  await wait(600)

  // 点击「自定义尺寸」选项（原生 click）
  const items = await page.$$('[data-slot="select-item"]')
  let clicked = false
  for (const item of items) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.includes("自定义尺寸")) {
      await item.click()
      clicked = true
      break
    }
  }
  console.log("已点击自定义尺寸选项:", clicked)
  await wait(700)

  // 触发按钮当前文本
  const nowText = await ratioTrigger.evaluate((el) => el.textContent.trim())
  console.log("选择后 trigger:", nowText)

  // 自定义尺寸输入框
  const inputExists = await page.evaluate(() =>
    [...document.querySelectorAll("input")].some((i) => i.placeholder && i.placeholder.includes("1344"))
  )
  console.log("自定义尺寸输入框出现:", inputExists)

  if (inputExists) {
    // 真实键入
    const input = await page.evaluateHandle(() =>
      [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1344"))
    )
    await input.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await input.click()
    await input.type("1344x1344")
    await wait(500)
    const value = await input.evaluate((el) => el.value)
    console.log("输入后 value:", JSON.stringify(value))
  }

  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
