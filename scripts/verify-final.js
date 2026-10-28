/* 最终验证：① 新增第二条后完整真实路径（按钮→跳转→后退→恢复 2 条+产品信息+产品图）
   ② 自定义尺寸：真实鼠标坐标点击输入框 → 可聚焦可输入 */
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
  await wait(800)
  await page.evaluate(() => localStorage.setItem("amazon-workbench.imageApiKey", "sk-test-dummy"))
  await page.reload({ waitUntil: "networkidle2" })
  await wait(800)

  // 上传产品图
  const fileInputs = await page.$$('input[type="file"]')
  await fileInputs[0].uploadFile("G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\scripts\\test-product.png")
  await wait(1200)

  // 填产品信息 + 新增一条 + 填 2 条提示词
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const info = [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("Material"))
    if (info) { setter.call(info, "Material: Silicone\nCapacity: 1.5L"); info.dispatchEvent(new Event("input", { bubbles: true })) }
  })
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("新增一条"))
    if (b) b.click()
  })
  await wait(400)
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const ts = [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容"))
    ts.forEach((t, i) => { setter.call(t, `真实路径提示词 ${i + 1}`); t.dispatchEvent(new Event("input", { bubbles: true })) })
  })
  await wait(500)

  // 自定义尺寸：真实鼠标坐标点击（更接近真实用户）
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
  const input = await page.evaluateHandle(() =>
    [...document.querySelectorAll("input")].find((i) => i.placeholder && i.placeholder.includes("1024x1024"))
  )
  const rect = await input.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  // 真实鼠标点击（坐标级）
  await page.mouse.click(rect.x, rect.y)
  await wait(300)
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  console.log("鼠标点击后焦点元素:", focused)
  await page.keyboard.type("1344x1344")
  await wait(400)
  const val = await input.evaluate((el) => el.value)
  console.log("真实鼠标+键盘输入后:", JSON.stringify(val))

  // 生图全部 → 跳转 → 后退
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("生图全部"))
    if (b) b.click()
  })
  await wait(2500)
  console.log("URL:", page.url())
  const draft = await page.evaluate(() => {
    const raw = localStorage.getItem("amazon-workbench.remixDraft")
    if (!raw) return null
    return { entryCount: JSON.parse(raw).entries.length, hasProductInfo: !!JSON.parse(raw).productInfo, hasImage: !!JSON.parse(raw).productImageDataUrl }
  })
  console.log("draft 快照:", JSON.stringify(draft))

  await page.goBack({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {})
  await wait(1500)
  const after = await page.evaluate(() => ({
    promptCount: [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容")).length,
    prompts: [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容")).map((t) => t.value),
    productInfo: [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("Material"))?.value,
    hasImg: !!document.querySelector("img"),
  }))
  console.log("返回后:", JSON.stringify(after))
  console.log("=== 断言 ===")
  console.log("条目数=2:", after.promptCount === 2)
  console.log("提示词逐条:", JSON.stringify(after.prompts) === JSON.stringify(["真实路径提示词 1", "真实路径提示词 2"]))
  console.log("产品信息:", after.productInfo === "Material: Silicone\nCapacity: 1.5L")
  console.log("产品图:", after.hasImg)
  console.log("自定义尺寸值:", JSON.stringify(val))
  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
