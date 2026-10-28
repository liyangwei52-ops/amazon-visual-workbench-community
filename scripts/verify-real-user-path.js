/* 完整用户路径：填配置/传图/填提示词 → 点「生图全部」真实跳转 → 浏览器后退 → 检查现场恢复；同时验证自定义尺寸真实点击 */
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

  // 1. 打开第二页，注入生图 API Key（假 key 只用于通过按钮校验；跳转后 /generate 会请求失败但不影响本验证）
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(800)
  await page.evaluate(() => {
    localStorage.setItem("amazon-workbench.imageApiKey", "sk-test-dummy")
  })
  await page.reload({ waitUntil: "networkidle2" })
  await wait(800)

  // 2. 上传产品图（真实文件选择）
  const fileInputs = await page.$$('input[type="file"]')
  console.log("file input 数量:", fileInputs.length)
  if (fileInputs.length > 0) {
    await fileInputs[0].uploadFile("G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\scripts\\test-product.png")
    await wait(1200)
  }

  // 3. 填产品信息 + 2 条提示词
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const info = [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("Material"))
    if (info) { setter.call(info, "Material: Silicone\nCapacity: 1.5L"); info.dispatchEvent(new Event("input", { bubbles: true })) }
    const ts = [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容"))
    ts.forEach((t, i) => { setter.call(t, `真实路径提示词 ${i + 1}`); t.dispatchEvent(new Event("input", { bubbles: true })) })
  })
  await wait(500)

  // 4. 自定义尺寸：真实鼠标点击「输出比例」→「自定义尺寸」→ 输入框 → 点击位置命中检测 + 键入
  const triggers = await page.$$('[data-slot="select-trigger"]')
  let ratioTrigger = null
  for (const t of triggers) {
    const txt = await t.evaluate((el) => el.textContent.trim())
    if (txt.includes("1:1")) { ratioTrigger = t; break }
  }
  if (ratioTrigger) {
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
    if (input) {
      const hit = await input.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2
        const top = document.elementFromPoint(cx, cy)
        return { inputRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, hitIsInput: top === el || el.contains(top) }
      })
      console.log("自定义尺寸输入框命中检测:", JSON.stringify(hit))
      await input.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await input.click()
      await input.type("1344x1344")
      await wait(400)
      const val = await input.evaluate((el) => el.value)
      console.log("自定义尺寸输入后:", JSON.stringify(val))
    } else {
      console.log("自定义尺寸输入框未出现")
    }
  }

  // 5. 点「生图全部」→ 等待跳转 /generate
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("生图全部"))
    if (b) b.click()
  })
  await wait(2500)
  const url = page.url()
  console.log("点击后 URL:", url)
  const draftExists = await page.evaluate(() => {
    const raw = localStorage.getItem("amazon-workbench.remixDraft")
    return raw ? { exists: true, len: raw.length } : { exists: false }
  })
  console.log("跳转后 remixDraft:", JSON.stringify(draftExists))
  const queueLen = await page.evaluate(() => {
    const raw = localStorage.getItem("amazon-workbench.generateQueue")
    return raw ? JSON.parse(raw).length : 0
  })
  console.log("generateQueue 任务数:", queueLen)

  // 6. 浏览器后退返回 /remix，检查现场恢复
  if (url.includes("/generate")) {
    await page.goBack({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {})
    await wait(1500)
    const after = await page.evaluate(() => ({
      url: location.pathname,
      promptCount: [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容")).length,
      prompts: [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容")).map((t) => t.value),
      productInfo: [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("Material"))?.value,
      productImage: !!document.querySelector("img[alt='新产品图']") || !!document.querySelector("img"),
    }))
    console.log("返回后:", JSON.stringify(after))
    console.log("条目数恢复:", after.promptCount === 2)
    console.log("提示词恢复:", JSON.stringify(after.prompts) === JSON.stringify(["真实路径提示词 1", "真实路径提示词 2"]))
    console.log("产品信息恢复:", after.productInfo === "Material: Silicone\nCapacity: 1.5L")
  }

  console.log("JS 错误数:", errors.length)
  if (errors.length) console.log(errors.slice(0, 5))
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
