/* 逐个测试 remix 页所有 select-trigger 的展开行为，并检查 aria 状态 */
const puppeteer = require("puppeteer-core")

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2400 })
  const errors = []
  page.on("pageerror", (err) => errors.push(String(err)))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()) })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 30000 })

  const info = await page.evaluate(() => {
    const triggers = [...document.querySelectorAll('[data-slot="select-trigger"]')]
    return triggers.map((t, i) => ({
      index: i,
      text: t.textContent.trim().slice(0, 40),
      expanded: t.getAttribute("aria-expanded"),
      dataOpen: t.hasAttribute("data-open"),
      rect: (() => { const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })(),
    }))
  })
  console.log(JSON.stringify(info, null, 1))

  for (const item of info) {
    const trigger = (await page.$$('[data-slot="select-trigger"]'))[item.index]
    // 滚动到元素
    await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await new Promise((r) => setTimeout(r, 200))
    await trigger.click()
    await new Promise((r) => setTimeout(r, 600))
    const after = await page.evaluate(() => {
      const ts = [...document.querySelectorAll('[data-slot="select-trigger"]')]
      return {
        expandedAll: ts.map((t) => t.getAttribute("aria-expanded")),
        contentExists: !!document.querySelector('[data-slot="select-content"]'),
        contentCount: document.querySelectorAll('[data-slot="select-content"]').length,
      }
    })
    console.log(`trigger[${item.index}] 点击后:`, JSON.stringify(after))
    // 关闭（按 Esc）
    await page.keyboard.press("Escape")
    await new Promise((r) => setTimeout(r, 300))
  }

  console.log("JS 错误数:", errors.length)
  if (errors.length) console.log(errors.slice(0, 5))
  await browser.close()
}

main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
