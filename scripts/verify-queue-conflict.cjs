// Isolated Edge profile, synthetic images, all model routes intercepted; no real credentials.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/queue-conflict-20261019')
const QUEUE = 'amazon-workbench.generateQueue'

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const fixture = async color => 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).png().toBuffer()).toString('base64')
  const oldImage = await fixture('#d4bca6'), newImage = await fixture('#a6c5d4')
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox', '--disable-background-timer-throttling'] })
  const reports = []
  try {
    for (const route of ['/', '/planner', '/remix', '/simple']) {
      console.log('Scenario', route)
      const context = await browser.createBrowserContext(), page = await context.newPage()
      const calls = [], errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setViewport({ width: 1440, height: 1000 })
      await page.setRequestInterception(true)
      page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
        if (url.pathname === '/api/images') { calls.push(request); return }
        if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
        void request.continue().catch(() => {})
      })
      await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
      await page.evaluate(async ({ route, oldImage, newImage }) => {
        const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-queue-conflict-only', model: 'gpt-image-2' }
        localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: connection, image: connection }))
        localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
        localStorage.setItem('amazon-workbench.generateOrigin', '/planner')
        localStorage.setItem('amazon-workbench.queueHold', 'true')
        const old = { id: 'same-source', label: '旧策划缺图', ratio: '1:1', customSize: '', quality: '1k', count: 2, prompt: 'OLD_PARTIAL 完整提示词原文', status: 'success', productImageDataUrl: '', inputBatchId: 'old-plan-input', resultUrls: [], resultsSaved: true, resultCount: 1 }
        localStorage.setItem('amazon-workbench.generateQueue', JSON.stringify([old, { ...old, id: 'old-unknown', label: '旧待确认', status: 'interrupted', count: 1, inputBatchId: undefined, resultCount: 0, resultUrls: [], resultsSaved: false, error: 'OLD_UNCERTAIN 请先核查服务商' }]))
        const put = async (database, storeName, key, value) => {
          const db = await new Promise((resolve, reject) => { const r = indexedDB.open(database, 1); r.onupgradeneeded = () => r.result.createObjectStore(storeName); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
          await new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
          db.close()
        }
        await put('amazon-workbench-inputs', 'records', 'old-plan-input', { images: [oldImage], tasks: [{ id: 'same-source', product: 0, products: [{ image: 0, name: '旧主产品.png' }], references: [] }] })
        await put('amazon-workbench-results', 'task-results', 'same-source', [oldImage])
        const entry = { id: 'same-source', enabled: true, ratio: 'custom', size: 'custom', customSize: '5:4', quality: '1k', count: '1', prompt: 'NEW_ONLY 完整正向与负向提示词，商品尺寸12cm。', references: [], extraNeeds: '新商品', title: '新图位' }
        const key = route === '/' ? 'amazon-workbench.draft.workbench' : route === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.' + (route === '/planner' ? 'planner' : 'simple')
        localStorage.setItem(key, JSON.stringify({ generationMode: 'image', productImages: [{ id: 'new-product', name: '新主产品.png', dataUrl: newImage }], ...(route === '/' ? { cards: [entry] } : { entries: [entry] }) }))
      }, { route, oldImage, newImage })
      await page.goto(BASE + route, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => [...document.querySelectorAll('[data-batch-generation] button')].some(button => button.getBoundingClientRect().width > 0 && !button.disabled))
      await page.evaluate(() => [...document.querySelectorAll('[data-batch-generation] button')].find(button => button.getBoundingClientRect().width > 0).click())
      await page.waitForFunction(() => location.pathname === '/generate')
      await page.waitForFunction(({ route, queue }) => JSON.parse(localStorage.getItem(queue)).some(task => task.sourceEntryId === 'same-source' && task.origin === route && task.status === 'running'), {}, { route, queue: QUEUE })
      const requestDeadline = Date.now() + 15000
      while (calls.length === 0 && Date.now() < requestDeadline) await new Promise(resolve => setTimeout(resolve, 25))
      assert.equal(calls.length, 1, '仅新增任务发出1次；旧缺图/待确认零重试')
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), QUEUE)
      assert.equal(saved.length, 3)
      assert.equal(saved[0].status, 'success')
      assert.equal(saved[0].resultCount, 1)
      assert.equal(saved[0].prompt, 'OLD_PARTIAL 完整提示词原文')
      assert.equal(saved[1].status, 'interrupted')
      assert.equal(saved[1].error, 'OLD_UNCERTAIN 请先核查服务商')
      assert.equal(saved[0].origin, '/planner')
      const incoming = saved[2]
      assert.notEqual(incoming.id, saved[0].id)
      assert.equal(incoming.sourceEntryId, 'same-source')
      assert.equal(incoming.origin, route)
      assert.equal(incoming.ratio, 'custom')
      assert.equal(incoming.customSize, '5:4')
      await page.waitForSelector(`[data-generation-task="${incoming.id}"] [data-task-origin="${route}"]`)
      assert.ok(await page.$('aside [data-generation-results="/planner"]'), '旧来源仍有结果入口')
      assert.ok(await page.$(`aside [data-generation-results="${route}"]`), '新来源有结果入口')
      await calls[0].respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: newImage }] }) })
      await page.waitForFunction(({ id, queue }) => JSON.parse(localStorage.getItem(queue)).find(task => task.id === id)?.status === 'success', {}, { id: incoming.id, queue: QUEUE })
      const readImages = async () => page.evaluate(async incomingId => {
        const read = async (database, storeName, key) => {
          const db = await new Promise(resolve => { const r = indexedDB.open(database, 1); r.onsuccess = () => resolve(r.result) })
          const value = await new Promise(resolve => { const r = db.transaction(storeName).objectStore(storeName).get(key); r.onsuccess = () => resolve(r.result) })
          db.close(); return value
        }
        return { old: await read('amazon-workbench-results', 'task-results', 'same-source'), current: await read('amazon-workbench-results', 'task-results', incomingId), oldInputs: await read('amazon-workbench-inputs', 'records', 'old-plan-input') }
      }, incoming.id)
      let images = await readImages()
      assert.deepEqual(images.old, [oldImage])
      assert.deepEqual(images.current, [newImage])
      assert.equal(images.oldInputs.images[0], oldImage)
      await page.reload({ waitUntil: 'networkidle0' })
      await page.waitForSelector('[data-queue-recovery]')
      assert.equal(calls.length, 1, '刷新不重跑新增结果或旧缺图/待确认')
      images = await readImages()
      assert.deepEqual(images.old, [oldImage])
      assert.deepEqual(images.current, [newImage])
      if (route === '/simple') {
        await page.screenshot({ path: OUT + '/mixed-results-desktop.png', fullPage: true })
        await page.setViewport({ width: 390, height: 844 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        await page.screenshot({ path: OUT + '/mixed-results-mobile.png', fullPage: true })
      }
      assert.deepEqual(errors, [])
      reports.push({ route, existingPartialAndUncertainRetained: true, newRequests: 1, oldRequests: 0, separateIDsAndSources: true, oldInputAndImagePreserved: true, refreshRequests: 0 })
      await context.close()
    }
    fs.writeFileSync(OUT + '/four-entry-results.json', JSON.stringify({ baseURL: BASE, browser: 'isolated headless Microsoft Edge', reports, realPaidRequests: 0 }, null, 2))
    console.log('PASS: 四入口均可在旧待确认/缺图存在时提交；仅新任务执行；同名ID/来源隔离；旧图/输入保留；刷新零重发（全模拟）')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
