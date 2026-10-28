const assert = require("node:assert/strict")
const puppeteer = require("puppeteer-core")
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII="
const DRAFT = "amazon-workbench.draft.simple"
async function click(page, label) {
  await page.evaluate(name => {
    const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === name && node.getBoundingClientRect().width > 0)
    if (!button) throw new Error("Missing button: " + name)
    button.click()
  }, label)
}
async function submit(page) {
  await page.evaluate(() => [...document.querySelectorAll("button")].find(node => node.textContent.trim().startsWith("开始生成")).click())
}
async function main() {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  try {
    for (const withProduct of [false, true]) {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 1440, height: 1000 })
      await page.evaluateOnNewDocument((product) => {
        const originalFetch = window.fetch
        window.fetch = (input, init) => {
          if (input === "/api/images") {
            const form = init.body
            const records = JSON.parse(sessionStorage.getItem("mode-submissions") || "[]")
            records.push({ images: form.getAll("images").length, prompt: form.get("prompt"), size: form.get("size") })
            sessionStorage.setItem("mode-submissions", JSON.stringify(records))
          }
          return originalFetch(input, init)
        }
        if (sessionStorage.getItem("seeded")) return
        sessionStorage.setItem("seeded", "1")
        localStorage.setItem("amazon-workbench.imageApiKey", "sk-mock-modes")
        localStorage.setItem("amazon-workbench.draft.simple", JSON.stringify({
          productImage: product ? { id: "fixture", name: "retained-product.png", dataUrl: product } : null,
          entries: [{ id: "mode-entry", enabled: true, prompt: "柔和光线下的森林小屋，完整的文字描述", ratio: "4:5", quality: "2k", count: "1", customSize: "" }],
        }))
      }, withProduct ? PNG : "")
      let requests = 0
      await page.setRequestInterception(true)
      page.on("request", request => {
        if (!request.url().endsWith("/api/images")) { void request.continue(); return }
        requests++
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ images: [{ src: PNG }] }) })
      })
      await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle0" })
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === "图文生图").getAttribute("aria-pressed")), "true")
      if (!withProduct) {
        await submit(page)
        await page.waitForFunction(() => document.body.innerText.includes("请先上传产品图"))
        assert.equal(requests, 0)
      }
      await click(page, "文生图")
      assert.equal(await page.$('input[type="file"]'), null)
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).generationMode === "text", {}, DRAFT)
      await page.reload({ waitUntil: "networkidle0" })
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === "文生图").getAttribute("aria-pressed")), "true")
      if (withProduct) {
        await click(page, "保存为套装")
        await click(page, "保存套装")
        assert.ok(await page.evaluate(() => !("productImageDataUrl" in JSON.parse(localStorage.getItem("amazon-workbench.suites"))[0])))
      }
      await submit(page)
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("amazon-workbench.generateQueue"))[0].status === "success")
      let captured = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mode-submissions")))
      assert.equal(captured[0].images, 0)
      assert.ok(!captured[0].prompt.includes("图片顺序说明"))
      assert.equal(captured[0].size, "2048x2560")
      assert.equal(requests, 1)
      await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle0" })
      if (withProduct) {
        await click(page, "图文生图")
        assert.equal(await page.$eval('img[alt="产品图"]', image => image.getAttribute("src")), PNG)
        await submit(page)
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("amazon-workbench.generateQueue"))[0].status === "success")
        captured = await page.evaluate(() => JSON.parse(sessionStorage.getItem("mode-submissions")))
        assert.equal(captured[1].images, 1)
        assert.ok(captured[1].prompt.includes("图片顺序说明"))
        assert.equal(captured[1].size, "2048x2560")
        assert.equal(requests, 2)
      } else {
        await page.screenshot({ path: "verification/simple-text-mode.png", fullPage: true })
        await page.setViewport({ width: 390, height: 844 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      }
      console.log("PASS: " + (withProduct ? "保留旧产品图时文生图不传图，保存套装不带旧图，切回图文模式恢复并提交产品图" : "缺图拦截；文生图无需产品图；模式刷新恢复；桌面与手机布局正常") + "；请求均为模拟，无 API 花费")
      await context.close()
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
