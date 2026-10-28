/* 验证：点击启用按钮后，底部「生图全部（启用 N 条）」数字实时变化 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2400 })
  const errors = []
  page.on("pageerror", (err) => errors.push(String(err)))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()) })
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 30000 })

  const buttonText = () => page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
    const b = btns.find((x) => x.textContent.includes("生图全部"))
    return b ? b.textContent.trim() : "未找到"
  })

  console.log("初始:", JSON.stringify(await buttonText()))

  // 默认 1 条已启用（createEntry enabled: true）
  // 停用它
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
    const b = btns.find((x) => x.textContent.trim() === "启用")
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 400))
  console.log("停用后:", JSON.stringify(await buttonText()))

  // 再启用（停用状态下按钮文本为「停用」）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
    const b = btns.find((x) => x.textContent.trim() === "停用")
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 400))
  console.log("重新启用后:", JSON.stringify(await buttonText()))

  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
