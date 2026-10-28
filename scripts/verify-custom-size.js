/* 复现：第二页条目卡选择「自定义尺寸」后，自定义尺寸输入框是否可填写 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1800 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 打开第一个条目卡的输出比例下拉（Trigger 显示「1:1 · 方形」）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("1:1"))
    if (b) b.click()
  })
  await wait(700)

  // 点击「自定义尺寸」选项
  const clickedCustom = await page.evaluate(() => {
    const opt = [...document.querySelectorAll("[role='option']")].find((o) => o.textContent.includes("自定义尺寸"))
    if (!opt) return "未找到自定义尺寸选项"
    opt.click()
    return "已点击自定义尺寸"
  })
  console.log(clickedCustom)
  await wait(700)

  // 检查条目卡各下拉当前显示文本
  const triggerTexts = await page.evaluate(() => {
    const triggers = [...document.querySelectorAll("button")]
      .filter((b) => /方形|横版|竖版|超宽|自定义|1K|2K/.test(b.textContent))
      .map((b) => b.textContent.trim().replace(/\n/g, " "))
    return triggers.slice(0, 6)
  })
  console.log("条目卡下拉文本:", JSON.stringify(triggerTexts))

  // 检查自定义尺寸输入框是否出现
  const customInput = await page.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1344"))
    if (!input) return { exists: false }
    return { exists: true, value: input.value, disabled: input.disabled, readOnly: input.readOnly }
  })
  console.log("自定义尺寸输入框:", JSON.stringify(customInput))

  // 尝试输入
  if (customInput && customInput.exists) {
    const typed = await page.evaluate(() => {
      const input = [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1344"))
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
      setter.call(input, "1344x1344")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      return input.value
    })
    console.log("输入后 value:", typed)
    await wait(400)
    const after = await page.evaluate(() => {
      const input = [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1344"))
      return input ? input.value : null
    })
    console.log("React 重渲染后 value:", JSON.stringify(after))
  }

  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
