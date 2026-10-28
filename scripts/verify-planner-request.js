const puppeteer = require("puppeteer-core")
const { readFileSync, writeFileSync } = require("node:fs")

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  try {
    const page = await browser.newPage()
    await page.goto("http://localhost:3000/planner", { waitUntil: "networkidle0" })
    await (await page.$('input[type="file"][accept*="image/png"]')).uploadFile("G:/2026/10月/测试/1.jpg")
    await (await page.$('input[type="file"][accept*=".xlsx"]')).uploadFile("G:/2026/10月/测试/cos服装图片策划 副本.xlsx")
    await page.waitForFunction(() => document.body.innerText.includes("已提取 800 字和 12 张内嵌图片"), { timeout: 30000 })
    await page.type('input[placeholder="sk-..."]', "sk-local-verification")

    let summary = null
    let capturedBody = null
    let requestCount = 0
    await page.setRequestInterception(true)
    page.on("request", (request) => {
      if (!request.url().endsWith("/api/analyze")) return request.continue()
      const body = JSON.parse(request.postData())
      requestCount++
      capturedBody = body
      summary = {
        imageCount: body.images.length,
        imageBytesApprox: body.images.map((image) => Math.floor((image.dataUrl.length * 3) / 4)),
        extractedDocumentText: body.userText.includes("【策划文档提取内容"),
        revisedSystemPrompt: body.systemPrompt.includes("逐张阅读参考图"),
        listedAllReferences: body.userText.includes("图13=image12.png"),
        mappedReferenceRows: body.userText.includes("image12.png（工作表 1 第 9 行）"),
      }
      return request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prompt: "【提示词 1｜验证方图】生成一张1:1方形副图。\n\n【提示词 2｜验证竖图】生成一张4:5竖版场景图。\n\n【提示词 3｜A+ 验证】生成一张横版A+图。" }),
      })
    })
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent.includes("开始策划"))
      if (!button) throw new Error("Plan button missing")
      button.click()
    })
    await page.waitForFunction(() => document.body.innerText.includes("验证竖图"), { timeout: 10000 })
    const ratioButtons = await page.evaluate(() => Array.from(document.querySelectorAll("button"))
      .map((button) => (button.textContent || "").trim())
      .filter((text) => text.startsWith("4:5") || text.startsWith("16:9")))
    summary.selectedRatioButtons = ratioButtons
    console.log(JSON.stringify(summary))
    if (!summary || summary.imageCount !== 13 || !summary.extractedDocumentText || !summary.revisedSystemPrompt || !summary.listedAllReferences || !summary.mappedReferenceRows || !ratioButtons.some((text) => text.startsWith("4:5")) || !ratioButtons.some((text) => text.startsWith("16:9"))) process.exitCode = 1
    const firstRatio = await page.evaluateHandle(() => Array.from(document.querySelectorAll("button"))
      .find((button) => (button.textContent || "").trim().startsWith("1:1 · 方形")))
    if (!firstRatio.asElement()) throw new Error("First ratio selector missing")
    await firstRatio.asElement().click()
    await page.waitForSelector('[role="option"]', { timeout: 5000 })
    const wideOption = await page.evaluateHandle(() => Array.from(document.querySelectorAll('[role="option"]'))
      .find((option) => (option.textContent || "").trim().startsWith("3:2")))
    if (!wideOption.asElement()) throw new Error("3:2 option missing")
    await wideOption.asElement().click()
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent.includes("开始策划"))
      if (!button) throw new Error("Plan button missing for second run")
      button.click()
    })
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (requestCount < 2) return
        clearInterval(timer)
        clearTimeout(timeout)
        resolve()
      }, 50)
      const timeout = setTimeout(() => { clearInterval(timer); reject(new Error("Second analyze request missing")) }, 10000)
    })
    await page.waitForFunction(() => document.body.innerText.includes("验证竖图") && !document.body.innerText.includes("策划分析中"), { timeout: 10000 })
    const manualSizePreserved = await page.evaluate(() => Array.from(document.querySelectorAll("button"))
      .some((button) => (button.textContent || "").trim().startsWith("3:2 · 横版")))
    const firstPromptAligned = await page.evaluate(() => Array.from(document.querySelectorAll("textarea"))
      .some((field) => field.value.includes("生成一张3:2横版副图") && field.value.includes("【最终画布尺寸】严格使用用户当前设置的 3072x2048")))
    const promptSamples = await page.evaluate(() => Array.from(document.querySelectorAll("textarea"))
      .map((field) => field.value.slice(-170)).filter((value) => value.includes("验证") || value.includes("最终画布尺寸")))
    console.log(JSON.stringify({ stage: "size-preservation", manualSizePreserved, firstPromptAligned, promptSamples, sizeSentToModel: capturedBody?.userText?.includes("【用户已设定的版位尺寸】") }))
    if (!manualSizePreserved || !firstPromptAligned || !capturedBody?.userText?.includes("【用户已设定的版位尺寸】")) process.exitCode = 1
    if (process.argv[2] === "--real" && capturedBody && process.exitCode !== 1) {
      const config = readFileSync(process.argv[3], "utf8").split(/\r?\n/).map((line) => line.trim())
      const valueAfter = (label) => {
        const index = config.indexOf(label)
        if (index < 0) throw new Error(`Missing ${label} in test config`)
        return config.slice(index + 1).find(Boolean) || ""
      }
      const apiKey = valueAfter("Key")
      capturedBody.apiKey = apiKey
      capturedBody.endpoint = valueAfter("Api网址")
      const label = valueAfter("分析模型")
      capturedBody.model = label === "5.6 Sol" ? "gpt-5.6-sol" : label
      const response = await fetch("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capturedBody),
        signal: AbortSignal.timeout(300000),
      })
      const result = await response.json()
      if (!response.ok) throw new Error((result.error || `HTTP ${response.status}`).replaceAll(apiKey, "[REDACTED]"))
      const prompt = result.prompt || ""
      const sections = [...prompt.matchAll(/【提示词\s*(\d+)｜([^】]+)】/g)]
      const positiveSections = [...prompt.matchAll(/【正向 Prompt】/g)].length
      const negativeSections = [...prompt.matchAll(/【负向 Prompt】/g)].length
      writeFileSync("verification/user-planner-uncompressed.txt", prompt)
      console.log(JSON.stringify({ stage: "real-response", promptCharacters: prompt.length, sections: sections.length, positiveSections, negativeSections, titles: sections.map((item) => item[2]) }))
      if (sections.length !== 9 || positiveSections !== 9 || negativeSections !== 9) process.exitCode = 1
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
