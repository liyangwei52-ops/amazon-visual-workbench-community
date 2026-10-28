/* 验证选中选项后值是否更新 */
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

  const triggerText = (i) => page.evaluate((idx) => {
    const t = document.querySelectorAll('[data-slot="select-trigger"]')[idx]
    return t ? t.textContent.trim() : ""
  }, i)

  console.log("初始 输出比例:", JSON.stringify(await triggerText(1)))
  console.log("初始 生成数量:", JSON.stringify(await triggerText(2)))

  // 打开输出比例菜单，选 3:2
  let t = (await page.$$('[data-slot="select-trigger"]'))[1]
  await t.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await t.click()
  await new Promise((r) => setTimeout(r, 500))
  const items = await page.$$('[data-slot="select-item"]')
  for (const item of items) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.includes("横版 3:2")) { await item.click(); break }
  }
  await new Promise((r) => setTimeout(r, 500))
  console.log("选择 3:2 后 输出比例:", JSON.stringify(await triggerText(1)))

  // 打开生成数量菜单，选 2
  t = (await page.$$('[data-slot="select-trigger"]'))[2]
  await t.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await t.click()
  await new Promise((r) => setTimeout(r, 500))
  const items2 = await page.$$('[data-slot="select-item"]')
  for (const item of items2) {
    const txt = await item.evaluate((el) => el.textContent)
    if (txt && txt.trim() === "2") { await item.click(); break }
  }
  await new Promise((r) => setTimeout(r, 500))
  console.log("选择 2 后 生成数量:", JSON.stringify(await triggerText(2)))

  // 检查自定义尺寸输入框是否随 size=custom 出现（选 3:2 不会出现；额外验证）
  console.log("JS 错误数:", errors.length)
  if (errors.length) console.log(errors.slice(0, 5))
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
