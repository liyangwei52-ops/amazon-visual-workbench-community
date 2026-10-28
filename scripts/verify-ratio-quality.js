/* 补充验证：清晰度下拉可点击出菜单；同网格行内卡片等高 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2600 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 新增到 3 条并填不同长度提示词
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("新增一条"))
    if (b) b.click()
  })
  await wait(500)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("新增一条"))
    if (b) b.click()
  })
  await wait(500)
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const ts = document.querySelectorAll("textarea")
    ts.forEach((t, i) => {
      setter.call(t, i === 0 ? "短提示词。" : `超长提示词。${"详细场景描述细节".repeat(i === 1 ? 160 : 40)}`)
      t.dispatchEvent(new Event("input", { bubbles: true }))
    })
  })
  await wait(600)

  // 等高：以「删除本条」按钮的卡片容器高度对比（同网格行）
  const heights = await page.evaluate(() => {
    const del = [...document.querySelectorAll("button[aria-label='删除本条']")]
    return del.slice(0, 3).map((d) => {
      let el = d
      for (let i = 0; i < 6 && el; i += 1) {
        el = el.parentElement
        if (el && /rounded|border/.test(el.className || "")) break
      }
      return el ? Math.round(el.getBoundingClientRect().height) : -1
    })
  })
  console.log("同一行 3 张条目卡高度:", JSON.stringify(heights))
  const uniform = heights.length === 3 && heights.every((h) => h === heights[0])
  console.log("等高:", uniform)

  // 清晰度下拉点击 → 菜单 1K/2K
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "2K")
    if (b) b.click()
  })
  await wait(700)
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll("[role='option']")].map((o) => o.textContent.trim()).filter((t) => /^1K$|^2K$/.test(t))
  )
  console.log("清晰度菜单项:", JSON.stringify(menu))

  // 比例下拉点击 → 菜单含 1:1/3:2/16:9 等
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("方形") || x.textContent.trim() === "1:1 · 方形")
    if (b) b.click()
  })
  await wait(700)
  const ratioMenu = await page.evaluate(() =>
    [...document.querySelectorAll("[role='option']")].map((o) => o.textContent.trim()).filter((t) => /^(1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9|custom)/.test(t))
  )
  console.log("比例菜单项:", JSON.stringify(ratioMenu.slice(0, 9)))

  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
