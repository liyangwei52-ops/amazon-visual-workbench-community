const puppeteer = require("puppeteer-core")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAFUlEQVR4nGP8z8Dwn4GBgYGJAQoAHQEAzQEBfE7siwAAAABJRU5ErkJggg=="

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1400 })
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("amazon-workbench.analyzeApiKey", "sk-test")
  })
  await page.goto("http://localhost:3000/planner", { waitUntil: "networkidle0" })
  await sleep(600)

  const zone = await page.evaluateHandle(() => {
    const nodes = Array.from(document.querySelectorAll("button,label,span,div")).filter((el) => el.textContent && el.textContent.includes("点击上传产品图"))
    nodes.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)
    return nodes[0]
  })
  try { await zone.asElement().hover() } catch {}
  await sleep(200)
  await page.evaluate((b64) => {
    const byteChars = atob(b64)
    const bytes = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
    const blob = new Blob([bytes], { type: "image/png" })
    const file = new File([blob], "product.png", { type: "image/png" })
    const dt = new DataTransfer()
    dt.items.add(file)
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  }, TEST_PNG_B64)
  await sleep(1200)

  const input = await page.$('input[type="file"][accept*=".xlsx"]')
  await input.uploadFile("G:\\2026\\10月\\shhshs\\amazon-visual-workbench\\scripts\\test-plan.xlsx")
  await sleep(3000)

  const state = await page.evaluate(() => {
    const body = document.body.textContent || ""
    const thumbs = Array.from(document.querySelectorAll("img")).map((img) => ({ alt: img.alt, srcLen: (img.src || "").length, srcHead: (img.src || "").slice(0, 30) }))
    const planBlock = Array.from(document.querySelectorAll("p,span")).filter((el) => el.textContent && (el.textContent.includes(".xlsx") || /竞品图/.test(el.textContent))).map((el) => el.textContent.slice(0, 80))
    return { bodyHasXlsx: body.includes("test-plan.xlsx") || body.includes("策划表.xlsx"), thumbs, planBlock }
  })
  console.log(JSON.stringify(state, null, 2))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
