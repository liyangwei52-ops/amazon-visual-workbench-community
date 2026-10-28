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
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })

  async function pasteInto(zoneSelector) {
    // 悬停到粘贴区
    await page.hover(zoneSelector)
    // 构造带图片的剪贴板事件并派发
    await page.evaluate(() => {
      const canvas = document.createElement("canvas")
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext("2d")
      ctx.fillStyle = "#4682b4"
      ctx.fillRect(0, 0, 128, 128)
      canvas.toBlob((blob) => {
        const file = new File([blob], "pasted-image.png", { type: "image/png" })
        const dt = new DataTransfer()
        dt.items.add(file)
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
        window.dispatchEvent(ev)
      })
    })
    await new Promise((r) => setTimeout(r, 1200))
  }

  const results = {}

  // —— /simple：产品图粘贴 ——
  await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle0" })
  const simpleZone = await page.evaluateHandle(() => {
    const label = Array.from(document.querySelectorAll("label")).find((el) => el.textContent && el.textContent.includes("点击上传产品图"))
    return label ? label.closest("div") : null
  })
  await simpleZone.asElement().hover()
  await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#4682b4"
    ctx.fillRect(0, 0, 128, 128)
    canvas.toBlob((blob) => {
      const file = new File([blob], "pasted-image.png", { type: "image/png" })
      const dt = new DataTransfer()
      dt.items.add(file)
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      window.dispatchEvent(ev)
    })
  })
  await new Promise((r) => setTimeout(r, 1500))
  results["simple 产品图粘贴"] = (await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"))
    return imgs.some((img) => img.src.startsWith("data:image/"))
  })) ? "OK（出现图片预览）" : "FAIL"

  // —— 第一页 /：产品图 + 参考图粘贴 ——
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" })
  const prodZone = await page.evaluateHandle(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((el) => el.textContent && el.textContent.includes("点击上传产品图"))
    return btn ? btn.closest("div") : null
  })
  await prodZone.asElement().hover()
  await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#4682b4"
    ctx.fillRect(0, 0, 128, 128)
    canvas.toBlob((blob) => {
      const file = new File([blob], "pasted-image.png", { type: "image/png" })
      const dt = new DataTransfer()
      dt.items.add(file)
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      window.dispatchEvent(ev)
    })
  })
  await new Promise((r) => setTimeout(r, 1500))
  results["第一页 产品图粘贴"] = (await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"))
    return imgs.filter((img) => img.src.startsWith("data:image/")).length > 0 ? "OK" : "FAIL"
  })) ? "OK（出现图片预览）" : "FAIL"

  // 参考图粘贴
  const refZone = await page.evaluateHandle(() => {
    const label = Array.from(document.querySelectorAll("label")).find((el) => el.textContent && el.textContent.includes("参考图 1"))
    return label ? label.closest("div") : null
  })
  await refZone.asElement().hover()
  await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#cd5c5c"
    ctx.fillRect(0, 0, 128, 128)
    canvas.toBlob((blob) => {
      const file = new File([blob], "pasted-ref.png", { type: "image/png" })
      const dt = new DataTransfer()
      dt.items.add(file)
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      window.dispatchEvent(ev)
    })
  })
  await new Promise((r) => setTimeout(r, 1500))
  results["第一页 参考图粘贴"] = (await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll("span,div")).filter((el) => el.textContent && el.textContent.trim() === "参考图 1")
    const card = badges[0] ? badges[0].closest(".relative") : null
    return card && card.querySelector("img[src^='data:image/']") ? "OK" : "FAIL"
  })) ? "OK（参考图 1 已有图）" : "FAIL"

  console.log(JSON.stringify({ results, errors }, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
