/**
 * 现场快照回归（导航切换版）：点左侧导航切走再切回，各页上传/填写内容自动恢复
 * 覆盖 /planner、/、/simple 三页：上传产品图 + 填写文本 → 切页 → 切回 → 恢复
 * 前置：本地服务 http://localhost:3000 已在运行（npm run start / next start）
 */
const puppeteer = require("puppeteer-core")
const fs = require("fs")
const path = require("path")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAFUlEQVR4nGP8z8Dwn4GBgYGJAQoAHQEAzQEBfE7siwAAAABJRU5ErkJggg=="

const results = []
function check(name, ok, extra = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  | " + extra : ""}`)
}

async function main() {
  const testPng = path.join(__dirname, "nav-test.png")
  fs.writeFileSync(testPng, Buffer.from(TEST_PNG_B64, "base64"))

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1600 })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))

  await page.evaluateOnNewDocument(() => {
    for (const key of [
      "amazon-workbench.draft.workbench",
      "amazon-workbench.draft.planner",
      "amazon-workbench.draft.simple",
      "amazon-workbench.draft.suite",
    ]) {
      localStorage.removeItem(key)
    }
  })

  const uploadFirstProduct = async () => {
    const input = await page.$('input[type="file"]')
    if (!input) throw new Error("未找到 file input")
    await input.uploadFile(testPng)
    await sleep(800) // 压缩 + 渲染
  }

  const clickNav = async (href) => {
    await page.click(`a[href="${href}"]`)
    await sleep(1500) // 客户端导航 + 挂载 + 恢复（fetch blob 异步）
  }

  /** 用 React 兼容的原生 setter 填 textarea（直接 value= 会被 React value tracker 重置） */
  const setTextarea = (index, value) =>
    page.evaluate(({ index, value }) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
      const areas = Array.from(document.querySelectorAll("textarea"))
      if (areas[index]) {
        setter.call(areas[index], value)
        areas[index].dispatchEvent(new Event("input", { bubbles: true }))
      }
    }, { index, value })

  const readFirstTextarea = () =>
    page.evaluate(() => {
      const el = document.querySelector("textarea")
      return el ? el.value : null
    })

  const imageVisible = () =>
    page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img")).filter((img) => img.src.startsWith("data:image/"))
      return imgs.length > 0
    })

  // ============ /planner ============
  await page.goto("http://localhost:3000/planner", { waitUntil: "networkidle0" })
  await page.reload({ waitUntil: "networkidle0" })
  await sleep(600)
  await uploadFirstProduct()
  await setTextarea(0, "Material: Red Cotton")
  await sleep(1100)
  const plannerDraft = await page.evaluate(() => localStorage.getItem("amazon-workbench.draft.planner"))
  check("/planner 快照已写入", Boolean(plannerDraft), plannerDraft ? `len=${plannerDraft.length}` : "无")
  check("/planner 快照含产品图", Boolean(plannerDraft && plannerDraft.includes("data:image/")))

  await clickNav("/")
  await clickNav("/planner")
  await sleep(600)
  check("/planner 产品信息恢复", (await readFirstTextarea()) === "Material: Red Cotton", String(await readFirstTextarea()))
  check("/planner 产品图恢复", await imageVisible())

  // ============ / （第一页） ============
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" })
  await page.reload({ waitUntil: "networkidle0" })
  await sleep(600)
  await uploadFirstProduct()
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const textareas = Array.from(document.querySelectorAll("textarea"))
    const infoArea = textareas.find((t) => (t.placeholder || "").includes("Package Includes"))
    if (infoArea) {
      setter.call(infoArea, "Capacity: 2L")
      infoArea.dispatchEvent(new Event("input", { bubbles: true }))
    }
  })
  await sleep(1100)
  const workbenchDraft = await page.evaluate(() => localStorage.getItem("amazon-workbench.draft.workbench"))
  check("第一页快照已写入", Boolean(workbenchDraft), workbenchDraft ? `len=${workbenchDraft.length}` : "无")
  check("第一页快照含产品图", Boolean(workbenchDraft && workbenchDraft.includes("data:image/")))

  await clickNav("/planner")
  await clickNav("/")
  await sleep(600)
  const wbInfo = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("textarea")).find((x) => (x.placeholder || "").includes("Package Includes"))
    return t ? t.value : null
  })
  check("第一页产品信息恢复", wbInfo === "Capacity: 2L", String(wbInfo))
  check("第一页产品图恢复", await imageVisible())

  // ============ /simple ============
  await page.goto("http://localhost:3000/simple", { waitUntil: "networkidle0" })
  await page.reload({ waitUntil: "networkidle0" })
  await sleep(600)
  await uploadFirstProduct()
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    const area = document.querySelector("textarea")
    if (area) {
      setter.call(area, "白底产品主图，居中，真实阴影")
      area.dispatchEvent(new Event("input", { bubbles: true }))
    }
  })
  await sleep(1100)
  const simpleDraft = await page.evaluate(() => localStorage.getItem("amazon-workbench.draft.simple"))
  check("/simple 快照已写入", Boolean(simpleDraft), simpleDraft ? `len=${simpleDraft.length}` : "无")
  check("/simple 快照含产品图", Boolean(simpleDraft && simpleDraft.includes("data:image/")))

  await clickNav("/planner")
  await clickNav("/simple")
  await sleep(600)
  check("/simple 提示词恢复", (await readFirstTextarea()) === "白底产品主图，居中，真实阴影", String(await readFirstTextarea()))
  check("/simple 产品图恢复", await imageVisible())

  check("无 JS 运行时错误", errors.length === 0, errors.slice(0, 3).join(" | "))

  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error("脚本异常:", e.message)
  process.exit(1)
})
