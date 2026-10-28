const assert = require("node:assert/strict")
const puppeteer = require("puppeteer-core")
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII="
const order = ["API 设置", "视觉工作台", "提示词迁移", "一键策划", "极简图文生图", "保存套装"]
const entries = [
  { id: "first", title: "主视觉", prompt: "完整的主视觉提示词，保持产品结构。", enabled: true, size: "4:5", customSize: "", quality: "2k", count: "1" },
  { id: "second", title: "细节特写", prompt: "完整的细节提示词，不改变商品。", enabled: false, size: "custom", customSize: "1440x960", quality: "1k", count: "1" },
  { id: "blank", title: "空白", prompt: " ", enabled: true, size: "1:1", customSize: "", quality: "2k", count: "1" },
]
async function click(page, label) {
  await page.evaluate(text => {
    const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === text && node.getBoundingClientRect().width > 0)
    if (!button) throw new Error("Missing button " + text)
    button.click()
  }, label)
}
async function main() {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  try {
    for (const route of ["/planner", "/simple", "/"]) {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 1440, height: 1000 })
      const errors = []
      page.on("pageerror", error => errors.push(error.message))
      await page.goto("http://localhost:3000" + route, { waitUntil: "networkidle0" })
      assert.deepEqual(await page.$$eval("aside nav a", links => links.map(a => a.textContent.trim())), order)
      await click(page, "保存为套装")
      assert.equal(await page.$eval("dialog", node => node.open), false)
      const productImage = { id: "product", name: "suite-fixture.png", dataUrl: PNG }
      const draft = { productImage, productInfo: "产品材质和尺寸说明", entries, cards: entries.map(item => ({ ...item, size: item.size === "custom" ? "custom" : "2048x2560", references: [] })) }
      if (route === "/simple") draft.entries = entries.map(item => ({ ...item, ratio: item.size }))
      const draftKey = "amazon-workbench.draft." + (route === "/" ? "workbench" : route.slice(1))
      await page.evaluate((key, value) => localStorage.setItem(key, JSON.stringify(value)), draftKey, draft)
      await page.reload({ waitUntil: "networkidle0" })
      await page.waitForFunction(() => [...document.querySelectorAll("textarea")].some(node => node.value.includes("完整的主视觉提示词")))
      await click(page, "保存为套装")
      await page.waitForSelector("dialog[open]")
      await click(page, "取消")
      assert.equal(await page.evaluate(() => localStorage.getItem("amazon-workbench.suites")), null)
      await click(page, "保存为套装")
      await page.click("dialog input")
      await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control")
      await page.type("dialog input", "套装保存回归")
      await click(page, "保存套装")
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("amazon-workbench.suites")))
      assert.equal(saved.length, 1)
      assert.equal(saved[0].entries.length, 2)
      assert.equal(saved[0].entries[0].prompt, entries[0].prompt)
      assert.equal(saved[0].entries[1].customSize, "1440x960")
      assert.deepEqual(Object.keys(saved[0]).sort(), ["entries", "id", "name", "savedAt"])
      assert.deepEqual(Object.keys(saved[0].entries[0]).sort(), ["customSize", "id", "prompt", "size"])
      await click(page, "保存为套装")
      await page.click("dialog input")
      await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control")
      await page.type("dialog input", "套装保存回归")
      await click(page, "保存套装")
      const updated = await page.evaluate(() => JSON.parse(localStorage.getItem("amazon-workbench.suites")))
      assert.equal(updated.length, 1)
      assert.equal(updated[0].id, saved[0].id)
      await page.goto("http://localhost:3000/suite", { waitUntil: "networkidle0" })
      assert.ok(await page.evaluate(() => document.body.innerText.includes("套装保存回归")))
      assert.ok(await page.evaluate(() => !/第[一二三]页/.test(document.body.innerText)))
      await page.evaluate(() => [...document.querySelectorAll("a")].find(a => a.textContent.trim() === "在提示词迁移使用").click())
      await page.waitForFunction(() => [...document.querySelectorAll("textarea")].some(node => node.value.includes("完整的主视觉提示词")))
      assert.ok(await page.evaluate(() => !/第[一二三]页/.test(document.body.innerText)))
      assert.ok(await page.evaluate(() => [...document.querySelectorAll("input")].some(node => node.value === "1440x960")))
      assert.deepEqual(errors, [])
      if (route === "/planner") {
        await page.goto("http://localhost:3000/planner", { waitUntil: "networkidle0" })
        await page.screenshot({ path: "verification/navigation-save-suite-desktop.png", fullPage: false })
        await page.setViewport({ width: 390, height: 844 })
        await page.$eval("details", node => { node.open = true })
        assert.deepEqual(await page.$$eval("details nav a", links => links.map(a => a.textContent.trim())), order)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        await page.screenshot({ path: "verification/navigation-save-suite-mobile.png", fullPage: false })
      }
      console.log("PASS: " + route + " 空内容拦截、取消、保存、同名更新、套装管理和迁移载入；自定义尺寸保留，存储仅含名称、提示词与比例")
      await context.close()
    }
    console.log("PASS: 桌面与手机导航顺序正确，页面无旧页码称呼；全程无需模型请求")
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
