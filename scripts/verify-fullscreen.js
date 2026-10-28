/* 验证：条目卡高度明显缩短；「全屏查看/编辑」覆盖层可打开、编辑实时同步回提示词框 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2200 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 填一条超长提示词（条目卡的提示词框）
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const t = document.querySelector("textarea[placeholder*='提示词内容']")
    setter.call(t, "超长提示词。" + "详细场景描述细节".repeat(180))
    t.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await wait(500)
  const beforeInfo = await page.evaluate(() => ({
    textareaCount: document.querySelectorAll("textarea").length,
    firstPromptLen: document.querySelector("textarea[placeholder*='提示词内容']")?.value.length || -1,
  }))
  console.log("点击前:", JSON.stringify(beforeInfo))

  // 卡片高度（应明显小于之前的 1349px）
  const cardHeight = await page.evaluate(() => {
    const del = document.querySelector("button[aria-label='删除本条']")
    let el = del
    for (let i = 0; i < 6 && el; i += 1) {
      el = el.parentElement
      if (el && /rounded|border/.test(el.className || "")) break
    }
    return el ? Math.round(el.getBoundingClientRect().height) : -1
  })
  console.log("单条卡片高度:", cardHeight, "(期望 < 700)")

  // 点击全屏查看
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === "全屏查看提示词")
    if (b) b.click()
  })
  await wait(600)
  const overlayInfo = await page.evaluate(() => {
    const overlay = document.querySelector(".fixed.inset-0.z-50")
    if (!overlay) return null
    const textarea = overlay.querySelector("textarea")
    return {
      visible: true,
      textareaHeight: textarea ? Math.round(textarea.getBoundingClientRect().height) : -1,
      charCount: textarea ? textarea.value.length : -1,
    }
  })
  console.log("全屏覆盖层:", JSON.stringify(overlayInfo))

  // 在全屏里追加文字 → 关闭 → 原提示词框应同步
  await page.evaluate(() => {
    const overlay = document.querySelector(".fixed.inset-0.z-50")
    const textarea = overlay.querySelector("textarea")
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    setter.call(textarea, textarea.value + "【全屏追加内容】")
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await wait(400)
  const overlayAfterEdit = await page.evaluate(() => {
    const overlay = document.querySelector(".fixed.inset-0.z-50")
    const textarea = overlay.querySelector("textarea")
    return { len: textarea.value.length, hasAppend: textarea.value.includes("【全屏追加内容】") }
  })
  console.log("全屏内追加后:", JSON.stringify(overlayAfterEdit))
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".fixed.inset-0.z-50 button")].find((x) => x.textContent.includes("保存并关闭"))
    if (b) b.click()
  })
  await wait(500)
  const synced = await page.evaluate(() => {
    const t = document.querySelector("textarea[placeholder*='提示词内容']")
    return { len: t ? t.value.length : -1, hasAppend: t ? t.value.includes("【全屏追加内容】") : false }
  })
  console.log("关闭后原提示词框:", JSON.stringify(synced))

  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
