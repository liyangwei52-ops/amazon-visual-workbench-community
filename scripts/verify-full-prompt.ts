import puppeteer from "puppeteer-core"
import { LEGACY_VISUAL_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/legacy-visual-strategist-prompt"
import { VISUAL_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/visual-strategist-prompt"

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  })
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument((legacy) => {
      localStorage.setItem("amazon-workbench.draft.workbench", JSON.stringify({ systemPrompt: legacy }))
      localStorage.setItem("amazon-workbench.analyzeApiKey", "sk-local-test")
    }, LEGACY_VISUAL_STRATEGIST_SYSTEM_PROMPT)
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" })
    const file = await page.$('input[type="file"][accept*="image/png"]')
    if (!file) throw new Error("Product input missing")
    await file.uploadFile("G:/2026/10月/测试/1.jpg")
    await page.waitForFunction(() => document.body.innerText.includes("1.jpg"), { timeout: 15000 })
    const finalText = "【正向 Prompt】\n" + "画面任务与产品硬约束：保持真实轮廓、准确数量和表面纹理；人物服务产品；构图、光影和材质逐项说明。".repeat(65)
      + "\n\n【负向 Prompt】\n" + "禁止改变商品结构、增减配件和出现错误文字。".repeat(30)
    let correctPolicy = false
    let finalOnlyInstruction = false
    await page.setRequestInterception(true)
    page.on("request", request => {
      if (!request.url().endsWith("/api/analyze")) { void request.continue(); return }
      const body = JSON.parse(request.postData() || "{}")
      correctPolicy = body.systemPrompt === VISUAL_STRATEGIST_SYSTEM_PROMPT
      finalOnlyInstruction = body.userText.includes("只输出最终正向与负向提示词")
      void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
        prompt: "【最终 AI 绘图 Prompt】\n```text\n" + finalText + "\n```"
      }) })
    })
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find(node => node.textContent?.trim() === "生成提示词")
      if (!button) throw new Error("Analyze button missing")
      button.click()
    })
    await page.waitForFunction(() => Array.from(document.querySelectorAll("textarea")).some(field => field.value.includes("【负向 Prompt】")), { timeout: 15000 })
    const preserved = await page.evaluate((expected) => Array.from(document.querySelectorAll("textarea")).some(field => field.value === expected), finalText)
    console.log(JSON.stringify({ correctPolicy, finalOnlyInstruction, fullPromptPreserved: preserved, promptCharacters: finalText.length }))
    if (!correctPolicy || !finalOnlyInstruction || !preserved) throw new Error("Full prompt regression failed")
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
