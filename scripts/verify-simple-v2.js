/* 极简图文生图 v2：多提示词卡交互验证 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2400 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 1. 默认 1 条卡
  const cardCount0 = await page.evaluate(() => document.querySelectorAll("textarea").length)
  console.log("初始提示词卡数:", cardCount0)

  // 2. 添加两条 → 3 条
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("添加提示词"))
    if (b) b.click()
  })
  await wait(300)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("添加提示词"))
    if (b) b.click()
  })
  await wait(400)
  const cardCount1 = await page.evaluate(() => document.querySelectorAll("textarea").length)
  console.log("添加 2 条后卡数:", cardCount1)

  // 3. 填 3 条提示词
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const ts = [...document.querySelectorAll("textarea")]
    ts.forEach((t, i) => { setter.call(t, `并发测试提示词 ${i + 1}`); t.dispatchEvent(new Event("input", { bubbles: true })) })
  })
  await wait(300)

  // 4. 第 2 条改成 3:2，第 3 条改数量 2，第 3 条取消启用
  const triggers = await page.$$('[data-slot="select-trigger"]')
  // 每条卡顺序：比例、清晰度、数量 → 第 2 条卡的比例 = 第 4 个 trigger
  await triggers[3].click()
  await wait(500)
  const items = await page.$$('[data-slot="select-item"]')
  for (const item of items) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.includes("3:2")) { await item.click(); break }
  }
  await wait(400)

  // 第 3 条卡数量 = trigger 索引 8（每条卡 3 个：0-2 卡1，3-5 卡2，6-8 卡3）→ triggers[8]
  await triggers[8].click()
  await wait(500)
  const items2 = await page.$$('[data-slot="select-item"]')
  for (const item of items2) {
    const txt = await item.evaluate((el) => el.textContent.trim())
    if (txt === "2") { await item.click(); break }
  }
  await wait(400)

  // 第 3 条卡取消启用：Switch 第 3 个
  const switches = await page.$$('[role="switch"]')
  await switches[2].click()
  await wait(400)

  // 5. 按钮文案：启用 2 条，第 2 条数量 1 + 第 3 条禁用 → totalCount = 2（卡1数量1 + 卡2数量1）？卡3 禁用。卡1 1 张 + 卡2 1 张 = 2
  const btnText = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("开始生成"))
    return b ? b.textContent.trim() : ""
  })
  console.log("按钮文案:", JSON.stringify(btnText))
  const enabledText = await page.evaluate(() => {
    const el = [...document.querySelectorAll("h3, p")].find((x) => x.textContent.includes("启用"))
    return el ? el.textContent : ""
  })
  console.log("启用计数:", JSON.stringify(enabledText))

  // 6. 删除第 1 条 → 剩 2 条
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === "删除本条")
    if (b) b.click()
  })
  await wait(300)
  const cardCount2 = await page.evaluate(() => document.querySelectorAll("textarea").length)
  console.log("删除后卡数:", cardCount2)

  // 7. 截图
  await page.screenshot({ path: "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\preview-simple.png" })
  console.log("JS 错误数:", errors.length)
  if (errors.length) console.log(errors.slice(0, 3))
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
