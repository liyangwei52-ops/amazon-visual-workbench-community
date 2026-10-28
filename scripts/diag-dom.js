const puppeteer = require("puppeteer-core")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.goto("http://localhost:3000/planner", { waitUntil: "networkidle0" })
  await sleep(800)
  const state = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label")).map((l) => l.textContent.trim())
    const tas = Array.from(document.querySelectorAll("textarea")).map((t) => ({
      placeholder: (t.placeholder || "").slice(0, 60),
    }))
    const docBtn = Array.from(document.querySelectorAll("button,span,p")).filter((el) => el.textContent && el.textContent.includes("上传策划文档")).map((el) => el.textContent.slice(0, 40))
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((i) => i.accept)
    return { labels, tas, docBtn, fileInputs }
  })
  console.log(JSON.stringify(state, null, 2))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
