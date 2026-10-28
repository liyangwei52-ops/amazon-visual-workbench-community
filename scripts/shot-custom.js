/* 选自定义尺寸后截图 */
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
  let ratioTrigger = null
  for (const t of triggers) {
    const txt = await t.evaluate((el) => el.textContent.trim())
    if (txt.includes("1:1")) { ratioTrigger = t; break }
  }
  await ratioTrigger.click()
  await wait(600)
  const items = await page.$$('[data-slot="select-item"]')
  for (const item of items) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.includes("自定义尺寸")) { await item.click(); break }
  }
  await wait(700)
  await page.evaluate(() => window.scrollTo(0, 600))
  await wait(300)
  await page.screenshot({ path: "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\preview-custom-size.png" })
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
