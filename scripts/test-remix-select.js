/* 实测第二页条目卡片「输出比例 / 生成数量」下拉能否点击、能否改值 */
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
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text())
  })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 30000 })

  // 条目 1 的输出比例 trigger（条目卡片里第一个 select-trigger）
  const triggers = await page.$$('[data-slot="select-trigger"]')
  console.log("页面内 select-trigger 数量:", triggers.length)

  if (triggers.length < 2) {
    console.log("FAIL: 找不到条目卡片里的下拉")
    await browser.close()
    process.exit(1)
  }

  // 输出比例 = triggers[0]，生成数量 = triggers[1]
  const sizeTrigger = triggers[0]
  const countTrigger = triggers[1]

  // 1. 点击输出比例，等待菜单
  await sizeTrigger.click()
  await new Promise((r) => setTimeout(r, 800))
  const sizeMenuOpen = await page.evaluate(() => !!document.querySelector('[data-slot="select-content"]'))
  console.log("输出比例点击后菜单弹出:", sizeMenuOpen)

  // 尝试点击一个选项（如果有）
  if (sizeMenuOpen) {
    const items = await page.$$('[data-slot="select-item"]')
    console.log("菜单内选项数:", items.length)
    if (items.length > 0) {
      const targetLabel = "1536 x 1024 · 横版 3:2"
      let hit = null
      for (const item of items) {
        const txt = await item.evaluate((el) => el.textContent)
        if (txt && txt.includes("横版 3:2")) hit = item
      }
      if (hit) {
        await hit.click()
        await new Promise((r) => setTimeout(r, 600))
        const val = await page.evaluate(() => {
          const trig = document.querySelectorAll('[data-slot="select-trigger"]')[0]
          return trig ? trig.textContent : ""
        })
        console.log("选择后触发器文本:", JSON.stringify(val))
      } else {
        console.log("未找到目标选项（3:2）")
        // 点第一个选项试试
        await items[0].click()
        await new Promise((r) => setTimeout(r, 400))
      }
    }
  }

  // 2. 点击生成数量
  await countTrigger.click()
  await new Promise((r) => setTimeout(r, 800))
  const countMenuOpen = await page.evaluate(() => !!document.querySelector('[data-slot="select-content"]'))
  console.log("生成数量点击后菜单弹出:", countMenuOpen)

  console.log("JS 错误数:", errors.length)
  if (errors.length) console.log(errors.slice(0, 5))
  await browser.close()
}

main().catch((err) => {
  console.error("脚本异常:", err)
  process.exit(1)
})
