/* 精确读取各卡像素 Badge */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2400 })
  await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 加一条 → 2 张卡
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("添加提示词"))
    if (b) b.click()
  })
  await wait(300)

  // 改第 2 张卡的比例为 3:2
  const triggers = await page.$$('[data-slot="select-trigger"]')
  await triggers[3].click()
  await wait(500)
  const items = await page.$$('[data-slot="select-item"]')
  for (const item of items) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.includes("3:2")) { await item.click(); break }
  }
  await wait(500)

  // 读所有像素 Badge（font-mono text-[10px]）
  const badges = await page.evaluate(() =>
    [...document.querySelectorAll("span")]
      .filter((s) => /^\d+x\d+$/.test(s.textContent.trim()))
      .map((s) => s.textContent.trim())
  )
  console.log("像素 Badge:", JSON.stringify(badges))

  // 读比例 trigger 文本
  const triggerTexts = []
  for (let i = 0; i < triggers.length; i++) {
    triggerTexts.push(await triggers[i].evaluate((el) => el.textContent.trim()))
  }
  console.log("triggers:", JSON.stringify(triggerTexts))
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
