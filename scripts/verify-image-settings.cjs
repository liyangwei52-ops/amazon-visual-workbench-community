const assert = require("node:assert/strict")
const puppeteer = require("puppeteer-core")
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII="
const KEY = "amazon-workbench.api-settings.v1"
const legacy = {
  analyzeEndpoint: "https://api.openlux.ai/v1", analyzeApiKey: "sk-analysis-legacy", analyzeModel: "legacy-analysis",
  imageEndpoint: "https://api.openai.com/v1", imageApiKey: "sk-image-legacy", imageModel: "legacy-image",
}
const expected = {
  analysis: { endpoint: "https://api.openlux.ai/v1", apiKey: "sk-analysis-central", model: "central-analysis" },
  image: { endpoint: "https://api.openlux.ai/v1", apiKey: "sk-image-central", model: "central-image" },
}
async function clickText(page, text) {
  await page.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === label)
    if (!button) throw new Error("Button missing: " + label)
    button.click()
  }, text)
}
async function fill(page, selector, value) {
  await page.click(selector)
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control")
  await page.type(selector, value)
}
async function uploadProduct(page) {
  await page.evaluate(async (data) => {
    const input = document.querySelector('input[type="file"][accept*="image"]')
    const transfer = new DataTransfer()
    transfer.items.add(new File([await (await fetch(data)).blob()], "settings-product.png", { type: "image/png" }))
    input.files = transfer.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }, PNG)
  await page.waitForFunction(() => document.body.innerText.includes("settings-product.png"))
}
async function main() {
  console.log("验证：启动隔离浏览器")
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  try {
    console.log("验证：载入设置页")
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 1000 })
    await page.goto("http://localhost:3000/settings", { waitUntil: "networkidle0" })
    await page.evaluate((seed) => {
      localStorage.clear()
      for (const [name, value] of Object.entries(seed)) localStorage.setItem("amazon-workbench." + name, value)
    }, legacy)
    await page.reload({ waitUntil: "networkidle0" })
    assert.equal(await page.$eval("#analysis-model", field => field.value), legacy.analyzeModel)
    assert.equal(await page.$eval("#image-endpoint", field => field.value), legacy.imageEndpoint)
    assert.equal(await page.$eval("#image-key", field => field.type), "password")
    console.log("验证：旧配置已恢复")
    const feature = await browser.newPage()
    const analysisRequests = []
    let imageRequests = 0
    await feature.evaluateOnNewDocument(() => {
      const original = window.fetch
      window.fetch = (input, init) => {
        if (input === "/api/images") {
          window.__imageSettings = Object.fromEntries(["endpoint", "apiKey", "model", "size"].map(name => [name, init.body.get(name)]))
        }
        return original(input, init)
      }
    })
    await feature.setRequestInterception(true)
    feature.on("request", request => {
      if (request.url().endsWith("/api/analyze")) {
        analysisRequests.push(JSON.parse(request.postData()))
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ prompt: (request.frame().url().endsWith("/remix") ? "【提示词 1】" : "【提示词 1｜主图】") + "\n【正向 Prompt】\n完整产品图提示词\n【负向 Prompt】\n禁止变形" }) })
      } else if (request.url().endsWith("/api/images")) {
        imageRequests++
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ images: [{ src: PNG }] }) })
      } else void request.continue()
    })
    // Keep a feature tab open while another tab edits and saves settings.
    await feature.goto("http://localhost:3000/", { waitUntil: "networkidle0" })
    await uploadProduct(feature)
    console.log("验证：提交设置前准备完成")
    await page.bringToFront()
    for (const group of ["analysis", "image"]) {
      for (const [field, value] of Object.entries(expected[group])) await fill(page, `#${group}-${field === "apiKey" ? "key" : field}`, value)
    }
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null, "Unsaved edits cannot change active settings")
    assert.equal(await page.evaluate(() => localStorage.getItem("amazon-workbench.imageEndpoint")), legacy.imageEndpoint)
    console.log("验证：修改未自动保存")
    await clickText(page, "保存设置")
    await page.waitForFunction(key => localStorage.getItem(key) !== null, {}, KEY)
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), expected)
    await feature.bringToFront()
    // Stale legacy writes cannot override the new settings.
    await feature.evaluate(() => localStorage.setItem("amazon-workbench.analyzeApiKey", "stale-key"))
    await clickText(feature, "生成提示词")
    await feature.waitForFunction(() => [...document.querySelectorAll("textarea")].some(field => field.value.includes("完整产品图提示词")))
    console.log("验证：已打开标签页使用新设置提交成功")
    for (const [route, button] of [["/planner", "开始策划"], ["/remix", "AI 改写全部"]]) {
      console.log("验证：分析入口 " + route)
      await feature.goto("http://localhost:3000" + route, { waitUntil: "networkidle0" })
      await uploadProduct(feature)
      if (route === "/remix") await feature.type('textarea[placeholder^="提示词内容"]', "待迁移的产品提示词")
      await clickText(feature, button)
      await feature.waitForFunction(() => [...document.querySelectorAll("textarea")].some(field => field.value.includes("完整产品图提示词")))
    }
    console.log("验证：三处分析请求已捕获")
    assert.equal(analysisRequests.length, 3)
    for (const request of analysisRequests) {
      for (const name of ["endpoint", "apiKey", "model"]) assert.equal(request[name], expected.analysis[name])
      assert.equal(request.images.length, 1)
    }
    await feature.evaluate((image) => {
      localStorage.setItem("amazon-workbench.generateQueue", JSON.stringify([{ id: "central-settings-test", label: "统一设置回归", ratio: "4:5", quality: "2k", count: 1, prompt: "测试产品图", productImageDataUrl: image, status: "queued", resultUrls: [] }]))
    }, PNG)
    await feature.goto("http://localhost:3000/generate", { waitUntil: "networkidle0" })
    await feature.waitForFunction(() => JSON.parse(localStorage.getItem("amazon-workbench.generateQueue"))[0].status === "success")
    const actual = await feature.evaluate(() => window.__imageSettings)
    for (const name of ["endpoint", "apiKey", "model"]) assert.equal(actual[name], expected.image[name])
    assert.equal(actual.size, "2048x2560")
    assert.equal(imageRequests, 1)
    for (const route of ["/", "/planner", "/remix", "/simple", "/suite", "/generate"]) {
      await feature.goto("http://localhost:3000" + route, { waitUntil: "networkidle0" })
      assert.equal(await feature.$$eval('input[type="password"], input[placeholder="sk-..."]', inputs => inputs.length), 0, route + " must not show API forms")
      assert.ok(await feature.$('a[href="/settings"]'), route + " must link to settings")
      assert.deepEqual(await feature.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), expected)
    }
    await page.bringToFront()
    await page.reload({ waitUntil: "networkidle0" })
    assert.equal(await page.$eval("#image-model", field => field.value), expected.image.model)
    await fill(page, "#image-model", "discard-this-edit")
    await clickText(page, "撤销修改")
    assert.equal(await page.$eval("#image-model", field => field.value), expected.image.model)
    await page.screenshot({ path: "verification/api-settings-desktop.png", fullPage: true })
    await page.setViewport({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile page must fit viewport")
    await page.screenshot({ path: "verification/api-settings-mobile.png", fullPage: true })
    console.log("PASS: 旧配置保留；未保存不生效；统一保存和刷新持久化；撤销修改；跨标签页使用最新设置")
    console.log("PASS: 工作台、策划、迁移的真实提交均使用统一分析配置；生图提交使用统一生图配置和 4:5 2K 尺寸（请求已模拟，无 API 花费）")
    console.log("PASS: 六个功能页无重复 API 表单且均有设置入口；桌面和手机布局验证通过")
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
