// Synthetic data in isolated Edge. All provider/model endpoints are intercepted; no real credentials or fees.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/result-batches-20261019/local')
const origins = ['/simple', '/', '/remix', '/planner']
const slug = origin => origin === '/' ? 'workbench' : origin.slice(1)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) { const end = Date.now() + 30000; while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(40) } }
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const images = await Promise.all(['#b3c8db', '#d8b2c5'].map(async color => 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).png().toBuffer()).toString('base64')))
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox', '--disable-background-timer-throttling'] })
  const reports = [], errors = []
  try {
    for (const origin of origins) {
      const context = await browser.createBrowserContext(), page = await context.newPage(), calls = []
      const source = slug(origin), storageKey = 'amazon-workbench.generateQueue.v2.' + source, oldBatch = 'old-input-' + source
      await page.setViewport({ width: 1440, height: 1050 })
      page.on('pageerror', error => errors.push(error.message))
      await page.setRequestInterception(true)
      page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
        if (url.pathname === '/api/images') { calls.push({ request, settled: false }); return }
        if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
        void request.continue().catch(() => {})
      })
      await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
      await page.evaluate(async ({ origin, source, storageKey, oldBatch, img }) => {
        const config = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-result-batches-only', model: 'gpt-image-2' }
        localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ image: config, analysis: config }))
        localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
        const old = [4, 4, 2].map((count, i) => ({ id: 'old-' + i, origin, inputBatchId: oldBatch, label: '上次任务' + i, ratio: '1:1', quality: '1k', customSize: '', count, prompt: 'OLD_BATCH_' + source, productImageDataUrl: '', status: i === 2 ? 'interrupted' : 'success', resultUrls: Array(i === 2 ? 1 : count).fill(img), resultCount: i === 2 ? 1 : count, resultsSaved: false }))
        localStorage.setItem(storageKey, JSON.stringify(old))
        await new Promise((resolve, reject) => {
          const open = indexedDB.open('amazon-workbench-inputs', 1)
          open.onupgradeneeded = () => open.result.createObjectStore('records')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put({ images: [img], tasks: old.map(task => ({ id: task.id, product: 0, references: [] })) }, oldBatch); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error) }
        })
        const entries = [4, 4, 4, 3].map((count, i) => ({ id: 'new-entry-' + i, title: '本次版位' + i, enabled: true, prompt: 'NEW_BATCH_' + source + '_' + i + ' 完整商品约束', extraNeeds: '展示商品', references: [], size: '1:1', ratio: '1:1', quality: '1k', customSize: '', count: String(count) }))
        localStorage.setItem(origin === '/' ? 'amazon-workbench.draft.workbench' : origin === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.' + source, JSON.stringify({ generationMode: 'image', productImages: [{ id: 'p', name: 'synthetic.png', dataUrl: img }], ...(origin === '/' ? { cards: entries } : { entries }) }))
      }, { origin, source, storageKey, oldBatch, img: images[0] })
      const queue = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey)
      const scope = `[data-generation-view="${origin}"]`
      async function button(label) {
        await page.evaluate(({ scope, label }) => { const button = [...document.querySelector(scope).querySelectorAll('button')].find(el => el.textContent.trim() === label); if (!button || button.disabled) throw Error('Missing/disabled ' + label); button.click() }, { scope, label })
      }
      async function viewCounts(total, ids) {
        await until(() => page.$eval(scope + ' [data-generation-batches]', (el, total) => el.textContent.includes('计划 ' + total + ' 张'), total), 'batch count ' + total)
        assert.deepEqual(await page.$$eval(scope + ' [data-generation-task]', cards => cards.map(card => card.dataset.generationTask)), ids)
        const progress = await page.$eval(scope + ' [data-generation-progress]', el => el.textContent)
        assert.ok(progress.includes('/' + total + ' 张'), '进度分母只计算本批')
        if (total === 15) assert.ok(!progress.includes('/25 张'), '不能累加成25张')
      }
      await page.goto(BASE + '/generate?source=' + source, { waitUntil: 'networkidle0' })
      // The editor already describes a new list. Its four unsent boxes are placeholders; old 10 are history.
      await until(() => page.$$eval(scope + ' [data-result-unsubmitted]', els => els.length === 4), 'current editor placeholders')
      assert.equal(calls.length, 0)
      await page.select(scope + ' [aria-label="查看生成批次"]', oldBatch)
      await viewCounts(10, ['old-0', 'old-1', 'old-2'])
      assert.equal(calls.length, 0, '恢复旧待确认不重发')
      await page.goto(BASE + origin, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => [...document.querySelectorAll('[data-batch-generation] button')].some(el => !el.disabled && el.getBoundingClientRect().width > 0))
      await page.evaluate(() => [...document.querySelectorAll('[data-batch-generation] button')].find(el => el.getBoundingClientRect().width > 0).click())
      await until(() => calls.length === 15, '15 first requests ' + source)
      const combined = await queue(), current = combined.filter(task => task.inputBatchId !== oldBatch), ids = current.map(task => task.id), latestBatch = current[0].inputBatchId
      assert.equal(combined.length, 7, '旧三条原样保留在队列，结果只显示新四条')
      assert.deepEqual(current.map(task => task.count), [4, 4, 4, 3])
      await viewCounts(15, ids)
      assert.equal(await page.$eval(scope + ' [aria-label="查看生成批次"]', el => el.value), latestBatch)
      const oldSnapshot = JSON.stringify(combined.filter(task => task.inputBatchId === oldBatch))
      await page.select(scope + ' [aria-label="查看生成批次"]', oldBatch)
      await viewCounts(10, ['old-0', 'old-1', 'old-2'])
      assert.equal(calls.length, 15, '查看历史不发请求')
      assert.equal(await page.$eval(scope + ' [aria-label="任务并发数量"]', el => el.disabled), true, '查看历史不能解开当前正在运行的并发设置')
      assert.ok(await page.$$eval(scope + ' button', buttons => buttons.find(el => el.textContent.trim() === '清空本栏目').disabled), '隐藏的运行任务仍保护清空操作')
      await page.select(scope + ' [aria-label="查看生成批次"]', latestBatch)
      await viewCounts(15, ids)
      // Every already-sent image is still received after switching between batch views.
      for (const call of calls) { call.settled = true; await call.request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: images[0] }] }) }) }
      await until(async () => (await queue()).filter(task => task.inputBatchId === latestBatch).every(task => task.status === 'success'), 'current 15 done')
      await viewCounts(15, ids)
      assert.ok((await page.$eval(scope + ' [data-generation-progress]', el => el.textContent)).includes('已返回 15/15 张'))
      await button('全选')
      assert.ok((await page.$eval(scope + ' [data-result-selection]', el => el.textContent)).includes('已选 15 张'), '全选不包含旧10张')
      await page.select(scope + ' [aria-label="查看生成批次"]', oldBatch)
      assert.ok((await page.$eval(scope + ' [data-result-selection]', el => el.textContent)).includes('已选 0 张'))
      await button('全选')
      assert.ok((await page.$eval(scope + ' [data-result-selection]', el => el.textContent)).includes('已选 10 张'))
      await page.select(scope + ' [aria-label="查看生成批次"]', latestBatch)
      assert.ok((await page.$eval(scope + ' [data-result-selection]', el => el.textContent)).includes('已选 0 张'))
      await page.click(scope + ` [data-generation-task="${ids[0]}"] [aria-label="选择任务 1 的第 1 张重绘"]`)
      await button('重绘所选 1 张')
      await until(() => calls.length === 16, 'redraw one current image')
      assert.equal((await queue()).filter(task => task.inputBatchId === latestBatch).length, 4)
      await viewCounts(15, ids)
      calls[15].settled = true; await calls[15].request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: images[1] }] }) })
      await until(async () => (await queue()).find(task => task.id === ids[0]).status === 'success', 'redraw complete')
      assert.equal(JSON.stringify((await queue()).filter(task => task.inputBatchId === oldBatch)), oldSnapshot, '旧任务/图片未被新提交或重绘改写')
      await page.select(scope + ' [aria-label="查看生成批次"]', oldBatch)
      await page.reload({ waitUntil: 'networkidle0' })
      await viewCounts(15, ids)
      assert.equal(calls.length, 16, '刷新回到最新批次，不恢复历史选择或重发')
      await page.screenshot({ path: OUT + '/' + source + '-latest15-desktop.png', fullPage: true })
      await page.setViewport({ width: 390, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: OUT + '/' + source + '-latest15-mobile.png', fullPage: true })
      const oldInputKept = await page.evaluate(async key => new Promise(resolve => { const open = indexedDB.open('amazon-workbench-inputs', 1); open.onsuccess = () => { const db = open.result, read = db.transaction('records').objectStore('records').get(key); read.onsuccess = () => { resolve(Boolean(read.result)); db.close() } } }), oldBatch)
      assert.equal(oldInputKept, true)
      reports.push({ origin, previousPlannedImages: 10, latestPlannedImages: 15, currentCards: 4, totalStoredTasks: 7, currentReceived: 15, mockCalls: calls.length, historicalInputsAndImagesKept: true, switchesNeverSend: true, selectionOnlyViewedBatch: true, redrawKeepsBatchAndPosition: true, refreshDefaultsLatestNoResend: true, mobileNoOverflow: true })
      await context.close()
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(OUT + '/results.json', JSON.stringify({ baseURL: BASE, browser: 'isolated headless Edge', reports, realPaidRequests: 0, mockCalls: reports.reduce((sum, report) => sum + report.mockCalls, 0), errors }, null, 2))
    console.log('PASS: 四入口10→15仅显示最新15、历史保留/查看不请求、运行中切批继续接收、选择隔离、重绘原位、刷新零重发（全模拟）')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
