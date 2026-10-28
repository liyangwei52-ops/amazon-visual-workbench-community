const puppeteer = require("puppeteer-core")

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1400 })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))

  // 在页面脚本执行前预置 localStorage（组件挂载即读到最新配置）；只首次清队列，避免 /generate 断言时被清掉
  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem("cleared-queue")) {
      sessionStorage.setItem("cleared-queue", "1")
      localStorage.removeItem("amazon-workbench.generateQueue")
      localStorage.removeItem("amazon-workbench.queueLock")
    }
    localStorage.setItem("amazon-workbench.imageApiKey", "sk-test-inline")
    localStorage.setItem("amazon-workbench.imageEndpoint", "https://api.openai.com/v1")
    localStorage.setItem("amazon-workbench.imageModel", "gpt-image-2")
  })

  // 准备：清空旧队列/旧配置
  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle0" })
  await page.reload({ waitUntil: "networkidle0" })

  // 上传新产品图（canvas 生成）
  const productZone = await page.evaluateHandle(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((el) => el.textContent && el.textContent.includes("点击上传新产品图"))
    return btn ? btn.closest("div") : null
  })
  await productZone.asElement().hover()
  await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#4682b4"
    ctx.fillRect(0, 0, 128, 128)
    canvas.toBlob((blob) => {
      const file = new File([blob], "product.png", { type: "image/png" })
      const dt = new DataTransfer()
      dt.items.add(file)
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      window.dispatchEvent(ev)
    })
  })
  await new Promise((r) => setTimeout(r, 1200))

  // 填入一条提示词
  await page.evaluate(() => {
    const tas = Array.from(document.querySelectorAll("textarea"))
    const ta = tas.find((el) => !el.placeholder.includes("Material") && el.value === "")
    if (ta) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
      setter.call(ta, "Professional product photo of a stainless steel pot, white background, studio lighting")
      ta.dispatchEvent(new Event("input", { bubbles: true }))
      ta.dispatchEvent(new Event("change", { bubbles: true }))
    }
  })
  await new Promise((r) => setTimeout(r, 600))

  // 点「生图全部」
  const btn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll("button")).find((el) => el.textContent && el.textContent.includes("生图全部"))
  })
  await btn.asElement().click()
  await new Promise((r) => setTimeout(r, 2500))

  const result = await page.evaluate(() => {
    const url = location.pathname
    const hasQueueHead = Array.from(document.querySelectorAll("h2")).some((el) => el.textContent && el.textContent.includes("本页生成队列"))
    const hasProgress = Array.from(document.querySelectorAll("h3, div, span")).some((el) => el.textContent && el.textContent.includes("生成进度"))
    const hasResultHead = Array.from(document.querySelectorAll("h2")).some((el) => el.textContent && el.textContent.includes("生成结果"))
    const taskCards = document.querySelectorAll("[class*=grid]").length
    return { url, hasQueueHead, hasProgress, hasResultHead, taskCards }
  })

  // /generate 页同步可见
  await page.goto("http://localhost:3000/generate", { waitUntil: "networkidle0" })
  const genPage = await page.evaluate(() => {
    const hasProgress = Array.from(document.querySelectorAll("div,span")).some((el) => el.textContent && el.textContent.includes("生成进度"))
    const hasTask = Array.from(document.querySelectorAll("span,div")).some((el) => el.textContent && el.textContent.trim() === "任务01")
    return { hasProgress, hasTask }
  })

  console.log(JSON.stringify({ remix: result, generate: genPage, errors }, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
