const puppeteer = require("puppeteer-core")

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 2400 })

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

  await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle0" })
  await page.reload({ waitUntil: "networkidle0" })

  // 上传产品图
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

  // 填 2 条提示词
  await page.evaluate(() => {
    const tas = Array.from(document.querySelectorAll("textarea")).filter((el) => !el.placeholder.includes("Material"))
    const texts = [
      "Professional product photo of a stainless steel pot, white background, studio lighting",
      "Lifestyle photo of the pot on a wooden table with fresh herbs, soft morning light",
    ]
    texts.forEach((text, i) => {
      if (tas[i]) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
        setter.call(tas[i], text)
        tas[i].dispatchEvent(new Event("input", { bubbles: true }))
        tas[i].dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
  })
  await new Promise((r) => setTimeout(r, 600))

  // 点「生图全部」
  const btn = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll("button")).find((el) => el.textContent && el.textContent.includes("生图全部"))
  )
  await btn.asElement().click()
  await new Promise((r) => setTimeout(r, 4000))

  // 滚动到队列区并截图
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent && h.textContent.includes("本页生成队列"))
    if (el) el.scrollIntoView({ block: "start" })
  })
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: "G:/2026/10月/shhshs/amazon-visual-workbench/preview-remix-inline.png" })

  // /generate 同步页截图
  await page.goto("http://localhost:3000/generate", { waitUntil: "networkidle0" })
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: "G:/2026/10月/shhshs/amazon-visual-workbench/preview-generate-inline.png" })

  console.log("shots done")
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
