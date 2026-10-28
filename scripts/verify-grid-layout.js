/* 造 5 条套装载入第二页 → 截图验证条目网格（3列 + 余数2） */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const SUITE_NAME = "网格验证套装"

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2600 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  // 1. 第三页保存 5 条套装
  await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle2", timeout: 60000 })
  await new Promise((r) => setTimeout(r, 500))
  await page.evaluate((value) => {
    const input = document.querySelector('input[placeholder="例如：玫瑰金岁数蜂窝"]')
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }, SUITE_NAME)
  for (let i = 1; i < 5; i += 1) {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("新增一条"))
      if (b) b.click()
    })
    await new Promise((r) => setTimeout(r, 200))
  }
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("textarea[placeholder*='提示词文本']")).forEach((t, index) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
      setter.call(t, `网格第${index + 1}条内容-${index + 1}`)
      t.dispatchEvent(new Event("input", { bubbles: true }))
    })
  })
  await new Promise((r) => setTimeout(r, 300))
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("保存套装修改"))
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 1200))

  // 2. 第二页：localStorage 自动载入
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await new Promise((r) => setTimeout(r, 600))
  await page.evaluate((name) => {
    const suites = JSON.parse(localStorage.getItem("amazon-workbench.suites") || "[]")
    const target = suites.find((s) => s.name === name)
    if (target) localStorage.setItem("amazon-workbench.loadSuiteId", target.id)
  }, SUITE_NAME)
  await page.reload({ waitUntil: "networkidle2" })
  await new Promise((r) => setTimeout(r, 1500))

  // 3. 检测条目卡片（textarea[placeholder*='提示词内容'] 所在 Card）的位置
  const layout = await page.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll("textarea[placeholder*='提示词内容']"))
    return textareas.map((t) => {
      const card = t.closest('[data-slot="card"]') || t.parentElement
      const r = card.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    })
  })
  console.log("条目卡片数量:", layout.length)
  console.log("条目卡片布局:", JSON.stringify(layout))

  // 分析网格规律
  if (layout.length >= 5) {
    const sameRow = (a, b) => Math.abs(a.y - b.y) < 20
    const row1 = layout.filter((c) => sameRow(c, layout[0]))
    const row2 = layout.filter((c) => !sameRow(c, layout[0]))
    console.log(`第一行 ${row1.length} 张（期望 3）:`, JSON.stringify(row1.map((c) => c.x)))
    console.log(`第二行 ${row2.length} 张（期望 2·余数）:`, JSON.stringify(row2.map((c) => c.x)))
  }

  await page.screenshot({ path: "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\preview-remix-grid.png", fullPage: true })
  console.log("已截图 preview-remix-grid.png")
  console.log("JS 错误数:", errors.length)

  // 清理测试套装
  await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle2", timeout: 60000 })
  await page.evaluate((name) => {
    const suites = JSON.parse(localStorage.getItem("amazon-workbench.suites") || "[]").filter((s) => s.name !== name)
    localStorage.setItem("amazon-workbench.suites", JSON.stringify(suites))
  }, SUITE_NAME)

  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
