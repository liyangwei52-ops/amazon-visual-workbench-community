/* 验证本轮三个改动：
   1. 第二页条目卡：输出比例=纯比例（1:1），清晰度=1K/2K 下拉可选
   2. 第二页条目卡等高（同网格行内高度一致）
   3. 生图全部 → 跳转 /generate 生图模块，任务卡带比例/清晰度标签 */
const puppeteer = require("puppeteer-core")
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2600 })
  const errors = []
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`) })

  // ---- 第二页：条目卡比例/清晰度 ----
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(800)

  const ratioTexts = await page.evaluate(() =>
    [...document.querySelectorAll("span")].filter((s) => s.textContent.includes("1:1") || s.textContent.includes("方形") || s.textContent.includes("横版") || s.textContent.includes("竖版") || s.textContent.includes("超宽")).slice(0, 6).map((s) => s.textContent.trim())
  )
  console.log("比例选项文本样例:", JSON.stringify(ratioTexts))

  // 清晰度下拉存在且含 1K/2K
  const qualityInfo = await page.evaluate(() => {
    const triggers = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "1K" || b.textContent.trim() === "2K")
    return triggers.map((t) => t.textContent.trim())
  })
  console.log("清晰度触发按钮:", JSON.stringify(qualityInfo))

  // 点击清晰度下拉 → 弹出 2 个选项（1K/2K）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "2K")
    if (b) b.click()
  })
  await wait(600)
  const qualityMenuItems = await page.evaluate(() =>
    [...document.querySelectorAll("[role='option'], li")].filter((o) => /^1K$|^2K$/.test(o.textContent.trim())).map((o) => o.textContent.trim())
  )
  console.log("清晰度菜单项:", JSON.stringify(qualityMenuItems))

  // 条目卡等高：同网格行内卡片高度对比
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("新增一条"))
    if (b) b.click()
  })
  await wait(400)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("新增一条"))
    if (b) b.click()
  })
  await wait(600)
  // 给不同条目填不同长度的提示词
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const ts = document.querySelectorAll("textarea")
    ts.forEach((t, i) => {
      const len = i === 0 ? 40 : i === 1 ? 900 : 300
      setter.call(t, "生成一张电商主图。" + "高质量细节描述".repeat(len / 7))
      t.dispatchEvent(new Event("input", { bubbles: true }))
    })
  })
  await wait(500)
  const cardHeights = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("main div.grid > div.rounded-xl, main div.grid > div[class*='rounded']")]
    return cards.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().height))
  })
  console.log("前 3 张条目卡高度:", JSON.stringify(cardHeights))

  // ---- 生图全部 → 跳转 /generate ----
  // 先造一条已填提示词的启用条目 + 产品图（用 canvas 造 dataUrl 上传太复杂，直接写入 localStorage 队列模拟）
  const queue = [
    {
      id: "verify-1", label: "提示词 1", ratio: "1:1", customSize: "", quality: "2k", count: 1,
      prompt: "测试生图任务提示词", productImageDataUrl: "", status: "queued", resultUrls: [], paused: false,
    },
    {
      id: "verify-2", label: "提示词 2", ratio: "16:9", customSize: "", quality: "1k", count: 2,
      prompt: "第二条测试任务", productImageDataUrl: "", status: "queued", resultUrls: [], paused: false,
    },
  ]
  await page.evaluate((q) => {
    localStorage.setItem("amazon-workbench.generateQueue", JSON.stringify(q))
  }, queue)
  await page.goto("http://localhost:3000/generate", { waitUntil: "networkidle2", timeout: 60000 })
  await wait(1200)

  const genInfo = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent?.trim(),
    taskLabels: [...document.querySelectorAll("span")].filter((s) => /^任务0\d$/.test(s.textContent.trim())).map((s) => s.textContent.trim()),
    ratioTags: [...document.querySelectorAll("span")].filter((s) => /^(1:1|16:9|3:2|2:3|4:3|3:4|9:16|21:9)$/.test(s.textContent.trim())).map((s) => s.textContent.trim()),
    qualityTags: [...document.querySelectorAll("span")].filter((s) => /^(1K|2K)$/.test(s.textContent.trim())).map((s) => s.textContent.trim()),
    progressText: document.querySelector("main")?.textContent?.includes("生成进度"),
    statusTexts: [...document.querySelectorAll("span")].filter((s) => /排队中|生成中|失败|已完成/.test(s.textContent.trim())).map((s) => s.textContent.trim()).slice(0, 6),
  }))
  console.log("生图模块页:", JSON.stringify(genInfo))

  console.log("JS 错误数:", errors.length)
  await browser.close()
}
main().catch((err) => { console.error("脚本异常:", err); process.exit(1) })
