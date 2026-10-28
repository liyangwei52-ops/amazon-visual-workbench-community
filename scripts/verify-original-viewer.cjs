// Isolated Edge, synthetic original images only. No model requests are allowed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const out = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/result-original-viewer-20261021/local')
const origins = ['/', '/planner', '/remix', '/simple']
const slug = origin => origin === '/' ? 'workbench' : origin.slice(1)
const report = { base, browser: 'isolated Microsoft Edge', checks: [], modelCalls: 0, errors: [] }
const pass = text => { report.checks.push(text); console.log('PASS ' + text) }
let browser
async function main() {
  fs.mkdirSync(out, { recursive: true })
  const bytes = await sharp({ create: { width: 2048, height: 1536, channels: 3, background: '#c87037' } }).png().toBuffer()
  const portrait = await sharp({ create: { width: 1536, height: 2048, channels: 3, background: '#286a85' } }).jpeg({ quality: 94 }).toBuffer()
  const images = ['data:image/png;base64,' + bytes.toString('base64'), 'data:image/jpeg;base64,' + portrait.toString('base64')]
  const expectedHash = crypto.createHash('sha256').update(bytes).digest('hex')
  const remote = 'https://image-fixture.example.test/fixtures/result-original.png'
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] })
  const context = await browser.createBrowserContext(), page = await context.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = new URL(request.url())
    if (request.url() === remote) return void request.respond({ status: 200, contentType: 'image/png', body: bytes })
    if (url.pathname.startsWith('/api/') || (!request.url().startsWith(base) && !/^(?:data|blob):/.test(request.url()))) { if (url.pathname === '/api/analyze' || url.pathname === '/api/images' || url.hostname === 'api.openlux.ai') report.modelCalls++; return void request.abort() }
    void request.continue().catch(() => {})
  })
  const click = async (scope, label) => page.$eval(scope, (el, label) => {
    const button = [...el.querySelectorAll('button')].find(el => el.textContent.trim() === label && el.getBoundingClientRect().width)
    if (!button || button.disabled) throw Error('Missing button ' + label)
    button.click()
  }, label)
  const dialog = '[data-result-image-viewer][open]'
  const hashInBrowser = async (page, url) => page.evaluate(async url => {
    const bytes = await (await fetch(url)).arrayBuffer()
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('')
  }, url)
  await page.goto(base + '/settings', { waitUntil: 'networkidle0' })
  await page.evaluate(async ({ origins, images, remote }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('amazon-workbench-results', 1); request.onupgradeneeded = () => request.result.createObjectStore('task-results'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('task-results', 'readwrite')
      for (const origin of origins) {
        const scope = origin === '/' ? 'workbench' : origin.slice(1), id = 'original-' + scope
        tx.objectStore('task-results').put([...images, ''], id)
        const task = { id, origin, label: '合成原图查看', ratio: '4:3', quality: '2k', customSize: '', count: 3, prompt: '完整测试提示词，无需模型请求。', productImageDataUrl: '', status: 'success', resultsSaved: true, resultCount: 2, resultUrls: ['', '', ''] }
        const tasks = [task]
        if (origin === '/simple') tasks.push({ ...task, id: 'remote-original', count: 1, resultsSaved: false, resultCount: 1, resultUrls: [remote] })
        localStorage.setItem('amazon-workbench.generateQueue.v2.' + scope, JSON.stringify(tasks))
      }
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error)
    }); db.close()
  }, { origins, images, remote })

  for (const origin of origins) {
    const name = slug(origin), gallery = `[data-generation-view="${origin}"] [data-task-gallery="original-${name}"]`
    await page.goto(base + '/generate?source=' + name, { waitUntil: 'networkidle0' })
    await page.waitForSelector(gallery + ' img')
    const before = await page.evaluate(() => document.body.style.overflow)
    await page.click(gallery + ' [aria-label="放大任务 1 第 1 张原图"]')
    await page.waitForSelector(dialog + ' a[target="_blank"][href^="blob:"]')
    await page.waitForFunction(selector => document.querySelector(selector)?.naturalWidth === 2048, {}, dialog + ' [data-original-image]')
    assert.equal(await page.$eval(dialog + ' [data-original-image]', el => el.naturalHeight), 1536)
    await click(dialog, '100% 原始尺寸')
    const raw = await page.$eval(dialog, el => { const img = el.querySelector('[data-original-image]'), viewport = el.querySelector('[data-image-viewport]'); return { w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height, sw: viewport.scrollWidth, sh: viewport.scrollHeight, cw: viewport.clientWidth, ch: viewport.clientHeight } })
    assert.equal(raw.w, 2048); assert.equal(raw.h, 1536); assert(raw.sw > raw.cw && raw.sh > raw.ch)
    await page.$eval(dialog + ' [aria-label="放大原图"]', el => el.click())
    await page.waitForFunction(selector => document.querySelector(selector)?.textContent === '125%', {}, dialog + ' [data-image-zoom]')
    assert.equal(await page.$eval(dialog + ' [data-original-image]', el => el.getBoundingClientRect().width), 2560)
    await page.$eval(dialog + ' [aria-label="缩小原图"]', el => el.click())
    await click(dialog, '适应窗口')
    await page.waitForFunction(selector => document.querySelector(selector)?.textContent === '适应窗口', {}, dialog + ' [data-image-zoom]')
    const fit = await page.$eval(dialog, el => { const img = el.querySelector('[data-original-image]'), viewport = el.querySelector('[data-image-viewport]'); return { w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height, cw: viewport.clientWidth, ch: viewport.clientHeight } })
    assert(fit.w <= fit.cw + 1 && fit.h <= fit.ch + 1, 'Fit geometry: ' + JSON.stringify(fit))
    const href = await page.$eval(dialog + ' a[target="_blank"]', el => el.href)
    assert.equal(await hashInBrowser(page, href), expectedHash)
    const popupTarget = browser.waitForTarget(target => target.type() === 'page' && target.url() === href, { timeout: 10000 })
    await page.click(dialog + ' a[target="_blank"]')
    const popup = await (await popupTarget).page()
    await popup.waitForFunction(() => document.images[0]?.naturalWidth === 2048)
    assert.equal(await popup.evaluate(() => window.opener), null)
    assert.equal(await hashInBrowser(popup, href), expectedHash)
    await page.bringToFront()
    await click(dialog, '关闭大图')
    await page.waitForFunction(() => !document.querySelector('[data-result-image-viewer][open]'))
    await page.waitForFunction(before => document.body.style.overflow === before, {}, before)
    assert.equal(await page.evaluate(() => document.body.style.overflow), before)
    assert.equal(await hashInBrowser(popup, href), expectedHash, 'closing viewer must not revoke an opened original')
    await popup.close()
    pass(name + ': 卡片点击、100%/125%/适应、滚动细节、新标签页原图尺寸及字节一致，关闭后原图链接仍有效')

    await click(gallery, '查看大图')
    await page.waitForSelector(dialog + ' a[target="_blank"]')
    assert.equal(await page.$eval(dialog + ' a[target="_blank"]', el => el.href), href, 'reopen reuses exported original URL')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('[data-result-image-viewer][open]'))
    await page.click(gallery + ' [aria-label="查看第 2 张图片"]')
    await click(gallery, '查看大图')
    await page.waitForFunction(selector => document.querySelector(selector)?.naturalHeight === 2048, {}, dialog + ' [data-original-image]')
    assert.equal(await page.$eval(dialog + ' [data-original-image]', el => el.naturalWidth), 1536)
    await page.$eval(dialog + ' [data-original-image]', el => el.click())
    await page.waitForFunction(selector => document.querySelector(selector)?.textContent === '100%', {}, dialog + ' [data-image-zoom]')
    await page.keyboard.press('Escape')
    await page.click(gallery + ' [aria-label="查看第 3 张图片"]')
    assert.equal(await page.$$eval(gallery + ' img', els => els.length), 0)
    assert(!(await page.$eval(gallery, el => el.textContent)).includes('查看大图'))
    pass(name + ': 查看大图入口、复用链接、第二张JPEG纵图/点击缩放、Esc与缺图占位保持正确')
  }

  const remoteGallery = '[data-generation-view="/simple"] [data-task-gallery="remote-original"]'
  await click(remoteGallery, '查看大图')
  await page.waitForSelector(dialog + ' [data-original-image]')
  assert.equal(await page.$eval(dialog + ' a[target="_blank"]', el => el.href), remote)
  assert.equal(await page.$eval(dialog + ' [data-original-image]', el => el.naturalWidth), 2048)
  await page.keyboard.press('Escape')
  pass('远程原图保留HTTPS直达链接，不依赖跨域读取；图像响应拦截模拟，未打开真实外站')

  await page.click('[data-task-gallery="original-simple"] [aria-label="查看第 1 张图片"]')
  await page.setViewport({ width: 390, height: 844 })
  await click('[data-task-gallery="original-simple"]', '查看大图')
  await page.waitForSelector(dialog + ' a[target="_blank"]')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const toolbar = await page.$eval(dialog + '[open] [role="toolbar"]', el => el.getBoundingClientRect().right)
  assert(toolbar <= 390)
  await click(dialog, '100% 原始尺寸')
  assert.equal(await page.$eval(dialog + ' [data-original-image]', el => el.getBoundingClientRect().width), 2048)
  await page.screenshot({ path: path.join(out, 'mobile-original-100.png') })
  await page.keyboard.press('Escape')
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-task-gallery="original-simple"] img')
  assert.equal(await page.$$eval('[data-result-image-viewer][open]', els => els.length), 0)
  assert.equal(report.modelCalls, 0); assert.deepEqual(report.errors, [])
  pass('手机操作栏换行且页面无横溢出，100%保持原图像素；刷新不自动开图/发模型请求')
  pass('四栏目共用查看器，IndexedDB旧原图直接可用；全程模型请求0、页面异常0')
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1 }).finally(async () => { if (browser) await browser.close(); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); if (report.failure) console.error(report.failure) })
