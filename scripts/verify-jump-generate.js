const puppeteer = require("puppeteer-core")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  return puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  })
}

async function gotoWithConfig(page, url) {
  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem("cleared-jump")) {
      sessionStorage.setItem("cleared-jump", "1")
      localStorage.removeItem("amazon-workbench.generateQueue")
      localStorage.removeItem("amazon-workbench.queueLock")
    }
    localStorage.setItem("amazon-workbench.imageApiKey", "sk-test-jump")
    localStorage.setItem("amazon-workbench.imageEndpoint", "https://api.openai.com/v1")
    localStorage.setItem("amazon-workbench.imageModel", "gpt-image-2")
    localStorage.setItem("amazon-workbench.analyzeApiKey", "sk-test-jump")
    localStorage.setItem("amazon-workbench.analyzeEndpoint", "https://api.openai.com/v1")
  })
  await page.goto(url, { waitUntil: "networkidle0" })
  await page.reload({ waitUntil: "networkidle0" })
}

async function pasteImage(page, imgB64, mime, zoneText) {
  // 1) puppeteer 真实 hover 到 PasteZone 内最深的文本元素（触发 onMouseEnter）
  const zone = await page.evaluateHandle((text) => {
    const nodes = Array.from(document.querySelectorAll("button,label,span,div")).filter(
      (el) => el.textContent && el.textContent.includes(text)
    )
    if (!nodes.length) return null
    nodes.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)
    return nodes[0]
  }, zoneText)
  if (zone) {
    try {
      await zone.asElement().hover()
    } catch {}
  }
  await sleep(200)
  // 2) canvas 生成 → window paste 事件
  await page.evaluate(
    (b64, mimeType) => {
      const byteChars = atob(b64)
      const bytes = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
      const blob = new Blob([bytes], { type: mimeType })
      const file = new File([blob], "product.png", { type: mimeType })
      const dt = new DataTransfer()
      dt.items.add(file)
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      window.dispatchEvent(ev)
    },
    imgB64,
    mime
  )
  await sleep(1200)
}

// 64x64 SteelBlue PNG（与 test-product.png 同款）
const TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAKUlEQVR4nO3OMQEAAAgDINc/9K3hGJKoA9wAAAAAAAAAAAAAAAC8GQJUAAFJaLyYAAAAAElFTkSuQmCC"

async function main() {
  const browser = await launch()
  const results = []

  // ===== 0) 侧边栏检查：无「生图模块」 =====
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1200 })
    await gotoWithConfig(page, "http://localhost:3000/")
    const sidebarText = await page.evaluate(() => {
      const nav = document.querySelector("aside") || document.body
      return nav.textContent || ""
    })
    results.push(["侧边栏不含「生图模块」", !sidebarText.includes("生图模块")])
    results.push(["侧边栏含「极简图文生图」", sidebarText.includes("极简图文生图")])
    await page.close()
  }

  // ===== 1) 第二页：点「生图全部」→ 跳转 /generate =====
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1200 })
    await gotoWithConfig(page, "http://localhost:3000/remix")

    // 上传产品图
    await pasteImage(page, TEST_PNG_B64, "image/png", "点击上传新产品图")

    // 填 2 条提示词（条目 1、2 的 textarea）
    await page.evaluate(() => {
      const tas = Array.from(document.querySelectorAll("textarea")).filter((el) => !(el.placeholder && el.placeholder.toLowerCase().includes("material")))
      const texts = ["PROMPT A pot on white", "PROMPT B pot lifestyle"]
      for (let i = 0; i < texts.length && i < tas.length; i++) {
        if (tas[i].value) continue
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
        setter.call(tas[i], texts[i])
        tas[i].dispatchEvent(new Event("input", { bubbles: true }))
        tas[i].dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    await sleep(500)

    // 若只有 1 条条目，新增一条并填第二条
    const entryCount = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent && b.textContent.includes("新增一条"))
      btns.forEach((b) => b.click())
      return btns.length
    })
    await sleep(400)
    if (entryCount > 0) {
      await page.evaluate(() => {
        const tas = Array.from(document.querySelectorAll("textarea")).filter((el) => !(el.placeholder && el.placeholder.toLowerCase().includes("material")))
        if (tas.length >= 2 && !tas[1].value) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
          setter.call(tas[1], "PROMPT B pot lifestyle")
          tas[1].dispatchEvent(new Event("input", { bubbles: true }))
          tas[1].dispatchEvent(new Event("change", { bubbles: true }))
        }
      })
      await sleep(300)
    }

    // 点「生图全部」
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes("生图全部"))
      if (btn) btn.click()
    })
    // 等待跳转
    let jumped = false
    for (let i = 0; i < 20; i++) {
      await sleep(250)
      const url = page.url()
      if (url.includes("/generate")) {
        jumped = true
        break
      }
      if (url.includes("/remix") === false) break
    }
    const queue = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("amazon-workbench.generateQueue")
        return raw ? JSON.parse(raw) : []
      } catch {
        return []
      }
    })
    results.push(["第二页「生图全部」跳转 /generate", jumped])
    results.push(["第二页入队任务数", queue.length >= 1 ? queue.length : 0])
    if (queue.length >= 1) results.push(["任务1含产品图", Boolean(queue[0].productImageDataUrl)])
    await page.close()
  }

  // ===== 2) 极简页：点「开始生成」→ 跳转 /generate =====
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1200 })
    await gotoWithConfig(page, "http://localhost:3000/simple")

    await pasteImage(page, TEST_PNG_B64, "image/png", "点击上传产品图")

    await page.evaluate(() => {
      const tas = Array.from(document.querySelectorAll("textarea")).filter((el) => !(el.placeholder && el.placeholder.toLowerCase().includes("material")))
      if (tas[0] && !tas[0].value) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
        setter.call(tas[0], "SIMPLE prompt product shot")
        tas[0].dispatchEvent(new Event("input", { bubbles: true }))
        tas[0].dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    await sleep(400)

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes("开始生成"))
      if (btn) btn.click()
    })
    let jumped = false
    for (let i = 0; i < 20; i++) {
      await sleep(250)
      if (page.url().includes("/generate")) {
        jumped = true
        break
      }
    }
    const queue = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("amazon-workbench.generateQueue")
        return raw ? JSON.parse(raw) : []
      } catch {
        return []
      }
    })
    results.push(["极简页「开始生成」跳转 /generate", jumped])
    results.push(["极简页入队任务数", queue.length])
    await page.close()
  }

  // ===== 3) 第一页：点卡内「生图」→ 跳转 /generate（带参考图） =====
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1200 })
    await gotoWithConfig(page, "http://localhost:3000/")

    await pasteImage(page, TEST_PNG_B64, "image/png", "点击上传产品图")

    // 填提示词（定位「点击「生成提示词」…」占位提示词的 textarea）
    await page.evaluate(() => {
      const tas = Array.from(document.querySelectorAll("textarea"))
      const ta = tas.find((el) => el.placeholder && el.placeholder.includes("生成提示词"))
      if (ta && !ta.value) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
        setter.call(ta, "WB prompt product on white")
        ta.dispatchEvent(new Event("input", { bubbles: true }))
        ta.dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    await sleep(400)

    // 点卡内「② 生图」按钮（文本以「生图」结尾）
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent && b.textContent.trim().endsWith("生图")
      )
      if (btn) btn.click()
    })
    let jumped = false
    for (let i = 0; i < 20; i++) {
      await sleep(250)
      if (page.url().includes("/generate")) {
        jumped = true
        break
      }
    }
    const queue = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("amazon-workbench.generateQueue")
        return raw ? JSON.parse(raw) : []
      } catch {
        return []
      }
    })
    results.push(["第一页卡内「生图」跳转 /generate", jumped])
    results.push(["第一页入队任务数", queue.length])
    if (queue.length >= 1) {
      results.push(["第一页任务 references 字段存在", Array.isArray(queue[0].references)])
      results.push(["第一页任务 ratio 归一化", queue[0].ratio])
      results.push(["第一页任务 quality 推断", queue[0].quality])
      results.push(["第一页任务使用卡片精确尺寸", queue[0].ratio === "custom" && /^\d+x\d+$/.test(queue[0].customSize) && queue[0].prompt.includes("【最终画布尺寸】严格使用用户当前设置的 " + queue[0].customSize)])
    }
    await page.close()
  }

  console.log("===== 跳转模式验证 =====")
  for (const [name, ok] of results) {
    console.log(`${ok === true || ok === false ? (ok ? "PASS" : "FAIL") : "INFO"}  ${name}${typeof ok !== "boolean" ? " = " + ok : ""}`)
  }
  const failed = results.filter((r) => r[1] === false)
  console.log(failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
