/* 验证：第二页填好条目/产品信息 → 跳转生图模块 → 返回第二页 → 现场自动恢复 */
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

  // 1. 第二页：填产品信息 + 2 条提示词 + 新增一条
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1000)

  // 填产品信息
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const t = [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("Material"))
    if (t) {
      setter.call(t, "Material: Silicone\nCapacity: 1.5L")
      t.dispatchEvent(new Event("input", { bubbles: true }))
    }
  })
  await wait(200)
  // 新增一条
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("新增一条"))
    if (b) b.click()
  })
  await wait(400)
  // 填 2 条提示词
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const ts = [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容"))
    ts.forEach((t, i) => {
      setter.call(t, `恢复测试提示词 ${i + 1}`)
      t.dispatchEvent(new Event("input", { bubbles: true }))
    })
  })
  await wait(400)

  // 检查当前状态
  const before = await page.evaluate(() => ({
    promptCount: [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容")).length,
    firstPrompt: [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("提示词内容"))?.value,
    productInfo: [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("Material"))?.value,
  }))
  console.log("跳转前:", JSON.stringify(before))

  // 2. 模拟「生图全部」：直接写队列+草稿并跳转（不依赖 API Key——但按钮要 API Key，所以手动模拟跳转前逻辑）
  //    改为直接注入草稿到 localStorage 后访问 /generate 再返回
  await page.evaluate((before) => {
    localStorage.setItem("amazon-workbench.remixDraft", JSON.stringify({
      entries: [
        { prompt: "恢复测试提示词 1", enabled: true, size: "1:1", customSize: "", quality: "2k", count: "1" },
        { prompt: "恢复测试提示词 2", enabled: true, size: "16:9", customSize: "", quality: "1k", count: "2" },
      ],
      productInfo: before.productInfo,
      productImageDataUrl: "",
      productImageName: "",
      savedAt: Date.now(),
    }))
  }, before)

  // 3. 访问 /generate（模拟跳转）再返回 /remix
  await page.goto("http://localhost:3000/generate", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(800)
  console.log("生图模块页标题:", await page.evaluate(() => document.querySelector("h1")?.textContent?.trim()))

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1200)

  // 4. 返回后检查现场恢复
  const after = await page.evaluate(() => ({
    promptCount: [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容")).length,
    prompts: [...document.querySelectorAll("textarea")].filter((x) => x.placeholder && x.placeholder.includes("提示词内容")).map((t) => t.value),
    productInfo: [...document.querySelectorAll("textarea")].find((x) => x.placeholder && x.placeholder.includes("Material"))?.value,
  }))
  console.log("返回后:", JSON.stringify(after))
  console.log("条目数恢复:", after.promptCount === 2)
  console.log("提示词内容恢复:", JSON.stringify(after.prompts[0]) === JSON.stringify("恢复测试提示词 1"))
  console.log("产品信息恢复:", after.productInfo === "Material: Silicone\nCapacity: 1.5L")
  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
