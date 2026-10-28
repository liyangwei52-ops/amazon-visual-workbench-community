const assert = require("node:assert/strict")
const puppeteer = require("puppeteer-core")
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII="
const QUEUE = "amazon-workbench.generateQueue"

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true, args: ["--no-sandbox", "--disable-gpu"],
  })
  try {
    for (const mode of ["busy", "gateway", "disconnect", "delayed-success"]) {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      const task = { id: "error-test-" + mode, label: mode, ratio: "1:1", quality: "2k", count: 1, prompt: "测试产品图", status: "queued", resultUrls: [], productImageDataUrl: PNG }
      await page.evaluateOnNewDocument((seed) => {
        if (sessionStorage.getItem("seeded")) return
        sessionStorage.setItem("seeded", "true")
        localStorage.setItem("amazon-workbench.imageApiKey", "sk-fake-test")
        localStorage.setItem("amazon-workbench.generateQueue", JSON.stringify([seed]))
      }, task)
      let requests = 0
      let held
      await page.setRequestInterception(true)
      page.on("request", request => {
        if (!request.url().endsWith("/api/images")) { void request.continue(); return }
        requests++
        if (mode === "disconnect") { void request.abort("failed"); return }
        if (mode === "delayed-success") { held = request; return }
        void request.respond({
          status: mode === "busy" ? 500 : 504, contentType: "application/json",
          body: JSON.stringify(mode === "busy"
            ? { error: "Current group upstream load is saturated (request id: browser-test-123)", outcome: "failed" }
            : { error: "上游网关等待超时 (request id: gateway-test)", outcome: "interrupted" }),
        })
      })
      await page.goto("http://localhost:3000/generate", { waitUntil: "domcontentloaded" })
      if (mode === "delayed-success") {
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("amazon-workbench.generateQueue") || "[]")[0]?.status === "running")
        await new Promise(resolve => setTimeout(resolve, 2000))
        assert.equal(requests, 1)
        assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].status, QUEUE), "running")
        assert.ok(held)
        await held.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ images: [{ src: PNG }] }) })
      }
      const expected = mode === "delayed-success" ? "success" : mode === "busy" ? "failed" : "interrupted"
      await page.waitForFunction((status) => JSON.parse(localStorage.getItem("amazon-workbench.generateQueue") || "[]")[0]?.status === status, {}, expected)
      const result = await page.evaluate(key => ({ task: JSON.parse(localStorage.getItem(key))[0], text: document.body.innerText }), QUEUE)
      if (mode === "busy") {
        assert.ok(result.text.includes("负载已满") && result.text.includes("browser-test-123"))
        assert.ok(!result.text.includes("有任务在离开页面时中断"))
      }
      if (mode === "gateway") assert.ok(result.task.error.includes("gateway-test"))
      if (mode === "disconnect") assert.ok(result.task.error.includes("Failed to fetch"))
      await page.reload({ waitUntil: "networkidle0" })
      assert.equal(requests, 1, mode + "刷新不能重发")
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].status, QUEUE), expected)
      console.log("PASS: " + mode + " → " + expected + "，仅请求一次，刷新保留结果")
      await context.close()
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
