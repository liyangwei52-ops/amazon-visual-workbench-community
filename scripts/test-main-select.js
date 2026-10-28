/* 实测第一页配置卡 / 请求卡内的下拉能否点开 */
const puppeteer = require("puppeteer-core")

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (err) => errors.push(String(err)))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()) })

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 30000 })

  const triggers = await page.$$('[data-slot="select-trigger"]')
  console.log("第一页 select-trigger 数量:", triggers.length)

  if (triggers.length > 0) {
    // 第一个（分析模型 gpt-4o 或 生图模型）
    await triggers[0].click()
    await new Promise((r) => setTimeout(r, 800))
    const menuOpen = await page.evaluate(() => !!document.querySelector('[data-slot="select-content"]'))
    console.log("第一页第一个下拉点击后菜单弹出:", menuOpen)

    // 找请求卡里的质量下拉（文本为"质量"的 FieldLabel 相邻 trigger）
    const hasQuality = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('[data-slot="field-label"]')]
      return labels.some((el) => el.textContent && el.textContent.trim() === "质量")
    })
    console.log("存在「质量」下拉标签:", hasQuality)
  }

  console.log("JS 错误数:", errors.length)
  if (errors.length) console.log(errors.slice(0, 5))
  await browser.close()
}

main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
