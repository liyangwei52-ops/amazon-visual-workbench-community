/* 验证第三页：选「自定义尺寸」→ 输入框出现 → 可输入 */
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

  await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 条目卡输出比例 trigger（文本含 1:1）
  const triggers = await page.$$('[data-slot="select-trigger"]')
  let ratioTrigger = null
  for (const t of triggers) {
    const txt = await t.evaluate((el) => el.textContent.trim())
    if (txt.includes("1:1")) { ratioTrigger = t; break }
  }
  if (!ratioTrigger) { console.log("未找到比例 trigger"); await browser.close(); return }
  await ratioTrigger.click()
  await wait(600)
  const items = await page.$$('[data-slot="select-item"]')
  let clicked = false
  for (const item of items) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.includes("自定义尺寸")) { await item.click(); clicked = true; break }
  }
  await wait(700)

  const inputInfo = await page.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1024x1024"))
    if (!input) return { exists: false }
    const r = input.getBoundingClientRect()
    return { exists: true, visible: r.width > 0 && r.height > 0, x: Math.round(r.x), y: Math.round(r.y) }
  })
  console.log("第三页自定义尺寸输入框:", JSON.stringify(inputInfo))

  if (inputInfo.exists) {
    const handle = await page.evaluateHandle(() =>
      [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1024x1024"))
    )
    await handle.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await handle.click()
    await handle.type("1536x1024")
    await wait(400)
    const value = await handle.evaluate((el) => el.value)
    console.log("输入后 value:", JSON.stringify(value))
  }
  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
