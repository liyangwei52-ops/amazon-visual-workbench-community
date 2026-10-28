/* 选自定义尺寸后截图，检查输入框在布局中的位置与可点性 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1800 })
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  const triggers = await page.$$('[data-slot="select-trigger"]')
  // 定位条目卡输出比例 trigger：找文本含「方形」的 trigger
  let ratioTrigger = null
  for (const t of triggers) {
    const txt = await t.evaluate((el) => el.textContent.trim())
    if (txt.includes("方形")) { ratioTrigger = t; break }
  }
  if (!ratioTrigger) { console.log("未找到比例 trigger"); return }
  await ratioTrigger.click()
  await wait(600)
  const items = await page.$$('[data-slot="select-item"]')
  for (const item of items) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.includes("自定义尺寸")) { await item.click(); break }
  }
  await wait(700)

  // 输入框位置与视口关系
  const info = await page.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1344"))
    if (!input) return { exists: false }
    const r = input.getBoundingClientRect()
    return {
      exists: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      visible: r.width > 0 && r.height > 0 && r.y >= 0 && r.y + r.height <= window.innerHeight,
    }
  })
  console.log("自定义尺寸输入框:", JSON.stringify(info))
  await page.screenshot({ path: "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\preview-custom-size.png", fullPage: false })
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
