/* 独立验证：清晰度下拉（1K/2K）可点击弹出菜单 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1600 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 找清晰度下拉的 trigger：紧邻「清晰度」label 的 select trigger
  const clicked = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("label, span")]
    const clarityLabel = labels.find((l) => l.textContent.trim() === "清晰度" && l.closest("[data-slot]"))
    if (!clarityLabel) return "未找到清晰度标签"
    const field = clarityLabel.closest("div")
    const trigger = field ? field.querySelector("button") : null
    if (!trigger) return "未找到清晰度trigger"
    trigger.click()
    return `已点击: ${trigger.textContent.trim()}`
  })
  console.log(clicked)
  await wait(800)

  const menu = await page.evaluate(() =>
    [...document.querySelectorAll("[role='option']")].map((o) => o.textContent.trim())
  )
  console.log("弹出菜单项:", JSON.stringify(menu))

  // 截图
  await page.screenshot({ path: "G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\preview-quality-menu.png", fullPage: false })
  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
