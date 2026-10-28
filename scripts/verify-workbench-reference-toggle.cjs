// Isolated browser + synthetic images only. All model endpoints are intercepted.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const crypto = require('node:crypto'), puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/workbench-reference-toggle')
const DRAFT = 'amazon-workbench.draft.workbench', QUEUE = 'amazon-workbench.generateQueue.v2.workbench'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) {
  const end = Date.now() + 20000
  while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(50) }
}
async function clickText(page, label, scope = 'body') {
  await page.waitForFunction(({ label, scope }) => [...document.querySelectorAll(scope + ' button')].some(el => el.textContent.trim() === label && !el.disabled && el.getBoundingClientRect().width > 0), {}, { label, scope })
  await page.evaluate(({ label, scope }) => [...document.querySelectorAll(scope + ' button')].find(el => el.textContent.trim() === label && !el.disabled && el.getBoundingClientRect().width > 0).click(), { label, scope })
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const assets = await Promise.all(['#aacccc', '#ccaaaa', '#aaccaa', '#ccaacc'].map(async (color, index) => {
    const bytes = await sharp({ create: { width: 96, height: 96, channels: 3, background: color } }).png().toBuffer()
    return { id: 'asset-' + index, name: (index < 2 ? 'product-' : 'reference-') + index + '.png', dataUrl: 'data:image/png;base64,' + bytes.toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
  }))
  const resultImage = 'data:image/png;base64,' + (await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ccddaa' } }).png().toBuffer()).toString('base64')
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] })
  const reports = [], errors = []
  try {
    for (const model of ['gpt-image-2', 'gemini-3-pro-image-preview']) {
      const context = await browser.createBrowserContext(), page = await context.newPage(), analyses = [], images = [], blocked = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setViewport({ width: 1440, height: 1000 })
      await page.evaluateOnNewDocument(() => {
        const original = window.fetch
        window.fetch = async (url, init) => {
          if (String(url) === '/api/images' && init?.body instanceof FormData) {
            const files = await Promise.all(init.body.getAll('images').map(async file => ({
              name: file.name,
              sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join(''),
            })))
            const capture = { files, prompt: init.body.get('prompt'), productImageCount: init.body.get('productImageCount'), imageCount: init.body.get('imageCount') }
            const headers = new Headers(init.headers)
            headers.set('x-test-reference-inputs', encodeURIComponent(JSON.stringify(capture)))
            return original.call(window, url, { ...init, headers })
          }
          return original.call(window, url, init)
        }
      })
      await page.setRequestInterception(true)
      page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
        if (url.pathname === '/api/analyze') {
          const body = JSON.parse(request.postData()); analyses.push(body)
          const marker = /MARKER_[A-C]/.exec(body.userText)?.[0]
          return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ prompt: `【正向 Prompt】\n${marker}。白色杯身、圆形杯口和侧面弧形把手，杯子在右侧浅蓝色桌面，左侧留白，无营销文字。\n【负向 Prompt】\n不要改变实物结构。` }) })
        }
        if (url.pathname === '/api/images') {
          images.push(JSON.parse(decodeURIComponent(request.headers()['x-test-reference-inputs'])))
          return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: resultImage }] }) })
        }
        if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !/^(data:|blob:)/.test(request.url()))) { blocked.push(request.url()); return void request.abort() }
        void request.continue().catch(() => {})
      })
      await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
      await page.evaluate(({ model, assets, DRAFT }) => {
        const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-reference-toggle-only', model: 'mock-analysis' }
        localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: connection, image: { ...connection, model } }))
        localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
        localStorage.setItem(DRAFT, JSON.stringify({ productImages: assets.slice(0, 2), cards: ['A', 'B', 'C'].map((letter, index) => ({
          id: letter, enabled: true, references: index < 2 ? assets.slice(2) : [], extraNeeds: 'MARKER_' + letter,
          prompt: 'MARKER_' + letter + '。完整提示词，不添加营销文字。', size: '1:1', customSize: '', quality: '1k', count: '1',
          // A intentionally represents an old draft without the new setting.
          ...(index === 1 ? { sendReferencesToGeneration: true } : index === 2 ? { sendReferencesToGeneration: false } : {}),
        })) }))
      }, { model, assets, DRAFT })
      await page.goto(BASE, { waitUntil: 'networkidle0' })
      const switchFor = id => `[data-request-card="${id}"] [role="switch"]`
      await page.waitForSelector(switchFor('A'))
      assert.equal(await page.$eval(switchFor('A'), el => el.getAttribute('aria-checked')), 'false', 'Old draft defaults off')
      assert.equal(await page.$eval(switchFor('B'), el => el.getAttribute('aria-checked')), 'true', 'Saved choice restored')
      await clickText(page, '新增请求')
      const newId = await page.$$eval('[data-request-card]', cards => cards.at(-1).getAttribute('data-request-card'))
      assert.equal(await page.$eval(switchFor(newId), el => el.getAttribute('aria-checked')), 'false', 'New card defaults off')
      await page.click('[aria-label="删除请求 4"]')
      // Exercise keyboard accessibility and no-reference case without submitting anything.
      await page.focus(switchFor('C')); await page.keyboard.press('Space')
      assert.equal(await page.$eval(switchFor('C'), el => el.getAttribute('aria-checked')), 'true')
      assert.equal(analyses.length + images.length, 0, 'Toggle alone never submits')
      for (const width of [1440, 390, 320]) {
        await page.setViewport({ width, height: 1000 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow at ' + width)
        const card = await page.$('[data-request-card="A"]')
        await card.screenshot({ path: path.join(OUT, model + '-' + width + '.png') })
      }
      await page.setViewport({ width: 1440, height: 1000 })
      await until(() => page.evaluate(DRAFT => JSON.parse(localStorage.getItem(DRAFT)).cards[2].sendReferencesToGeneration === true, DRAFT), 'draft stored')
      await page.reload({ waitUntil: 'networkidle0' })
      for (const [id, value] of [['A', 'false'], ['B', 'true'], ['C', 'true']]) assert.equal(await page.$eval(switchFor(id), el => el.getAttribute('aria-checked')), value)
      assert.equal(analyses.length + images.length, 0, 'Reload never submits')
      // Both off and on cards must send all references during analysis.
      await clickText(page, '生成提示词 3 条')
      await until(() => analyses.length === 3 && page.evaluate(() => [...document.querySelectorAll('[data-request-card] textarea')].filter(el => el.value.includes('白色杯身')).length === 3), 'analysis returned')
      for (const call of analyses) {
        const expected = call.userText.includes('MARKER_C') ? assets.slice(0, 2) : assets
        assert.deepEqual(call.images.map(image => image.dataUrl), expected.map(asset => asset.dataUrl))
        assert.deepEqual(call.images.map(image => image.role), ['product', 'product-detail', ...expected.slice(2).map(() => 'reference')])
      }
      async function completed(expectedRequests) {
        await until(() => images.length === expectedRequests, 'image requests ' + expectedRequests)
        await page.waitForFunction(QUEUE => { const tasks = JSON.parse(localStorage.getItem(QUEUE) || '[]'); return tasks.length === 3 && tasks.every(task => task.status === 'success') }, {}, QUEUE)
      }
      const checkInput = (call, withRefs) => {
        assert.deepEqual(call.files, (withRefs ? assets : assets.slice(0, 2)).map(({ name, sha256 }) => ({ name, sha256 })), 'Actual multipart files and order')
        assert.equal(call.productImageCount, '2'); assert.equal(call.imageCount, '1')
        assert.equal(call.prompt.includes('图3：竞品参考图'), withRefs, 'Identity suffix matches submitted files')
        assert.equal(call.prompt.includes('图4：竞品参考图'), withRefs)
        assert.ok(call.prompt.includes('图2：我方补充产品图'))
      }
      await clickText(page, '生成 3 条')
      await completed(3)
      for (const call of images) checkInput(call, call.prompt.includes('MARKER_B'))
      const originalIds = await page.evaluate(QUEUE => JSON.parse(localStorage.getItem(QUEUE)).map(task => task.id), QUEUE)
      // Change next-generation choices, then reload results; old task snapshots stay frozen.
      await page.goto(BASE, { waitUntil: 'networkidle0' })
      await page.click(switchFor('A')); await page.click(switchFor('B'))
      await until(() => page.evaluate(DRAFT => { const cards = JSON.parse(localStorage.getItem(DRAFT)).cards; return cards[0].sendReferencesToGeneration === true && cards[1].sendReferencesToGeneration === false }, DRAFT), 'flipped choices stored')
      await page.goto(BASE + '/generate?source=workbench', { waitUntil: 'networkidle0' })
      assert.equal(images.length, 3, 'Navigation does not resend')
      await page.click('[aria-label="选择任务 1 重绘"]')
      await page.click('[aria-label="选择任务 2 重绘"]')
      await clickText(page, '重绘所选 2 张')
      await completed(5)
      for (const call of images.slice(3)) checkInput(call, call.prompt.includes('MARKER_B'))
      assert.deepEqual(await page.evaluate(QUEUE => JSON.parse(localStorage.getItem(QUEUE)).map(task => task.id), QUEUE), originalIds)
      // A fresh single-card submit uses its latest on setting and keeps other slots.
      await page.goto(BASE, { waitUntil: 'networkidle0' })
      await clickText(page, '② 生图', '[data-request-card="A"]')
      await completed(6); checkInput(images[5], true)
      assert.ok(images[5].prompt.includes('MARKER_A'))
      assert.deepEqual(await page.evaluate(QUEUE => JSON.parse(localStorage.getItem(QUEUE)).map(task => task.id), QUEUE), originalIds)
      await page.reload({ waitUntil: 'networkidle0' }); await delay(200)
      assert.equal(images.length, 6); assert.equal(analyses.length, 3)
      assert.deepEqual(blocked, [], 'All traffic remained within the mocked app')
      reports.push({ model, defaultsOff: true, perCardPersistence: true, analysisAlwaysIncludesReferences: true, actualFileHashesAndOrder: true, batchAndSingle: true, redrawUsesOriginalSnapshot: true, noReferenceCard: true, noAutomaticRequests: true, responsiveWidths: [1440, 390, 320], mockAnalyses: analyses.length, mockImages: images.length })
      await context.close()
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ baseURL: BASE, reports, realPaidRequests: 0, errors }, null, 2))
    console.log('PASS: reference toggle defaults/persistence; analysis always submits; generation file bytes/order; GPT/Gemini targets; batch/single/redraw snapshots; refresh/no automatic requests; desktop/mobile. Mock only.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
