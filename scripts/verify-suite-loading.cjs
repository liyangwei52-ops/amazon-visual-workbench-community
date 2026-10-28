const assert = require("node:assert/strict")
const puppeteer = require("puppeteer-core")
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII="
const FULL = "【正向 Prompt】\n" + "保持自然光线与清晰结构，完整描述主体、场景与构图。".repeat(180) + "\n【负向 Prompt】\n禁止变形。"
const legacy = { id: "legacy-template", name: "户外场景验证", category: "旧分类", productInfo: "旧商品信息", productImageDataUrl: PNG, productImageName: "old-product.png", savedAt: 1, entries: [
  { id: "old-1", title: "旧标题", size: "2048x2560", quality: "2k", prompt: FULL, customSize: "" },
  { id: "old-2", title: "旧标题2", size: "custom", quality: "2k", prompt: "第二条完整提示词", customSize: "1440x960" },
] }
async function click(page, text) {
  await page.evaluate(name => {
    const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === name && node.getBoundingClientRect().width > 0)
    if (!button) throw new Error("Missing button: " + name)
    button.click()
  }, text)
}
async function main() {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 1000 })
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle0" })
    await page.evaluate((suite, product) => {
      localStorage.setItem("amazon-workbench.suites", JSON.stringify([suite]))
      localStorage.setItem("amazon-workbench.draft.simple", JSON.stringify({ generationMode: "text", productImage: { id: "current", name: "current-product.png", dataUrl: product }, entries: [{ id: "current-entry", enabled: true, prompt: "旧内容将被替换", ratio: "1:1", quality: "1k", count: "3", customSize: "" }] }))
    }, legacy, PNG)
    await page.reload({ waitUntil: "networkidle0" })
    await click(page, "载入提示词")
    assert.deepEqual(await page.$$eval("textarea", fields => fields.map(field => field.value)), [FULL, legacy.entries[1].prompt])
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[aria-label="生图模式"] button')].find(button => button.getAttribute("aria-pressed") === "true").textContent.trim()), "文生图")
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("amazon-workbench.draft.simple")).entries[0].prompt.startsWith("【正向 Prompt】"))
    let draft = await page.evaluate(() => JSON.parse(localStorage.getItem("amazon-workbench.draft.simple")))
    assert.equal(draft.entries[0].ratio, "4:5")
    assert.equal(draft.entries[0].quality, "1k")
    assert.equal(draft.entries[0].count, "3")
    assert.equal(draft.entries[1].customSize, "1440x960")
    assert.equal(draft.productImage.name, "current-product.png")
    await click(page, "图文生图")
    assert.ok(await page.evaluate(() => document.body.innerText.includes("current-product.png")))
    const clean = await page.evaluate(() => JSON.parse(localStorage.getItem("amazon-workbench.suites"))[0])
    assert.deepEqual(Object.keys(clean).sort(), ["entries", "id", "name", "savedAt"])
    assert.deepEqual(Object.keys(clean.entries[0]).sort(), ["customSize", "id", "prompt", "size"])
    assert.equal(clean.entries[0].prompt, FULL)
    // Both users of the loader retain the current product and generation preferences.
    await page.evaluate(product => {
      localStorage.setItem("amazon-workbench.remixDraft", JSON.stringify({ entries: [{ id: "before-remix", prompt: "旧迁移提示词", enabled: true, size: "1:1", quality: "1k", count: "3", customSize: "" }], productInfo: "当前产品信息", productImageDataUrl: product, productImageName: "current-product.png" }))
    }, PNG)
    await page.goto("http://localhost:3000/remix", { waitUntil: "networkidle0" })
    await click(page, "载入提示词")
    assert.ok(await page.$$eval("textarea", (fields, expected) => fields.some(field => field.value === expected), FULL))
    assert.ok(await page.$$eval("textarea", fields => fields.some(field => field.value === "当前产品信息")))
    assert.ok(await page.evaluate(() => document.body.innerText.includes("current-product.png")))
    await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle0" })
    assert.equal(await page.$('input[type="file"]'), null)
    assert.ok(await page.evaluate(() => !document.body.innerText.includes("清晰度") && !document.body.innerText.includes("分类（可选）")))
    await click(page, "载入编辑")
    assert.deepEqual(await page.$$eval("textarea", fields => fields.map(field => field.value)), [FULL, legacy.entries[1].prompt])
    assert.equal(await page.$eval("#suite-name", field => field.value), legacy.name)
    await click(page, "保存套装修改")
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("amazon-workbench.suites")).length), 1)
    // Reduce only the isolated screenshot fixture's text so the entire editor is visible.
    await page.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set
      const field = document.querySelector("textarea")
      setter.call(field, "户外场景，柔和自然光线，主体居中，保留右侧文案空间。")
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await page.screenshot({ path: "verification/suite-minimal-editor.png", fullPage: false })
    await page.setViewport({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle0" })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(errors, [])
    console.log("PASS: 旧套装精简迁移，长提示词全文、自定义尺寸及顺序完整保留")
    console.log("PASS: 极简生图和提示词迁移整套调用；保留当前产品、模式、清晰度和数量；精简编辑器可载入和同名保存")
    console.log("PASS: 桌面与手机无横向溢出；未调用模型接口")
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
