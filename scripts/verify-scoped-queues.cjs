// Isolated Edge and synthetic data only. Every model route is intercepted.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/scoped-queues-20261019')
const origins = ['/', '/planner', '/remix', '/simple']
const slug = origin => origin === '/' ? 'workbench' : origin.slice(1)
const key = origin => 'amazon-workbench.generateQueue.v2.' + slug(origin)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) { const end = Date.now() + 20000; while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(30) } }

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const images = await Promise.all(['#d4a6a6', '#a6d4b1', '#a6b9d4', '#d0b0d9'].map(async color => 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).png().toBuffer()).toString('base64')))
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
  const reports = []
  async function surface() {
    const context = await browser.createBrowserContext(), page = await context.newPage(), calls = [], errors = []
    async function wire(target) {
      target.on('pageerror', error => errors.push(error.message))
      await target.setViewport({ width: 1440, height: 1050 })
      await target.evaluateOnNewDocument(() => {
        const original = window.fetch
        window.fetch = (url, init) => {
          if (String(url) === '/api/images' && init?.body instanceof FormData) {
            const headers = new Headers(init.headers)
            headers.set('x-scoped-test', encodeURIComponent(String(init.body.get('prompt'))))
            return original.call(window, url, { ...init, headers })
          }
          return original.call(window, url, init)
        }
      })
      await target.setRequestInterception(true)
      target.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
        if (url.pathname === '/api/images') {
          const prompt = decodeURIComponent(request.headers()['x-scoped-test'] || '')
          const match = /SCOPED_TEST_(workbench|planner|remix|simple)_(\d)/.exec(prompt)
          if (!match) { void request.abort(); errors.push('Missing request trace'); return }
          calls.push({ request, source: match[1], entry: Number(match[2]), settled: false })
          return
        }
        if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
        void request.continue().catch(() => {})
      })
    }
    await wire(page)
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
    return { context, page, calls, errors, wire }
  }
  async function seed(page) {
    await page.evaluate(({ origins, images }) => {
      const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-scoped-queues-only', model: 'gpt-image-2' }
      localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: connection, image: connection }))
      localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
      for (const [index, origin] of origins.entries()) {
        const source = origin === '/' ? 'workbench' : origin.slice(1)
        localStorage.setItem('amazon-workbench.generateConcurrency.v1.' + source, '1')
        const entries = [0, 1].map(i => ({ id: 'same-entry-' + i, enabled: true, prompt: `SCOPED_TEST_${source}_${i} 完整正负向提示词，商品尺寸12cm。`, size: 'custom', ratio: 'custom', customSize: '5:4', count: '1', quality: '1k', title: '版位' + i, extraNeeds: '展示商品', references: [] }))
        const draft = origin === '/' ? 'amazon-workbench.draft.workbench' : origin === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.' + source
        localStorage.setItem(draft, JSON.stringify({ generationMode: 'image', productImages: [{ id: 'p', name: source + '.png', dataUrl: images[index] }], ...(origin === '/' ? { cards: entries } : { entries }) }))
      }
    }, { origins, images })
  }
  const queue = (page, origin) => page.evaluate(({ storageKey, origin }) => {
    const value = localStorage.getItem(storageKey)
    if (value !== null) return JSON.parse(value)
    const fallback = localStorage.getItem('amazon-workbench.generateOrigin.legacy-v2') || localStorage.getItem('amazon-workbench.generateOrigin') || '/'
    return JSON.parse(localStorage.getItem('amazon-workbench.generateQueue') || '[]').filter(task => (task.origin || fallback) === origin)
  }, { storageKey: key(origin), origin })
  async function view(page, origin) {
    await page.waitForFunction(origin => { const el = document.querySelector(`[data-generation-view="${origin}"]`); return el && el.getBoundingClientRect().width > 0 }, {}, origin)
    assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('source')), slug(origin))
    const ids = await page.$$eval(`[data-generation-view="${origin}"] [data-generation-task]`, cards => cards.map(card => card.dataset.generationTask))
    assert.deepEqual(ids, (await queue(page, origin)).map(task => task.id), '只显示本栏目任务')
  }
  async function nav(page, origin, input = false) {
    await page.evaluate(({ origin, input }) => {
      const source = origin === '/' ? 'workbench' : origin.slice(1)
      const selector = input ? `[data-generation-input="${origin}"], [data-nav-key="${source}"]` : `[data-generation-results="${origin}"]`
      const element = [...document.querySelectorAll('aside ' + selector.split(', ').join(', aside '))].find(el => el.getBoundingClientRect().width > 0 && (!input || el.dataset.generationInput === origin || new URL(el.href).pathname === origin))
      if (!element) throw Error('Missing navigation ' + origin)
      element.click()
    }, { origin, input })
    if (input) await page.waitForFunction(origin => location.pathname === origin, {}, origin)
    else await view(page, origin)
  }
  async function click(page, origin, label) {
    await page.evaluate(({ origin, label }) => {
      const button = [...document.querySelector(`[data-generation-view="${origin}"]`).querySelectorAll('button')].find(button => button.textContent.trim() === label)
      if (!button || button.disabled) throw Error('Missing/disabled ' + label)
      button.click()
    }, { origin, label })
  }
  async function respond(item, origin, uncertain = false) {
    assert.ok(item && !item.settled)
    item.settled = true
    await item.request.respond({ status: uncertain ? 504 : 200, contentType: 'application/json', body: JSON.stringify(uncertain ? { error: 'MOCK_UNCERTAIN_ONLY_THIS_SCOPE', outcome: 'interrupted' } : { images: [{ src: images[origins.indexOf(origin)] }] }) })
  }
  try {
    const s = await surface(), { page, calls } = s
    await seed(page)
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
    await page.evaluate(() => window.scopedNavigationToken = 'same-document')
    for (const origin of origins) {
      if (origin !== '/') await nav(page, origin, true)
      await page.waitForFunction(() => [...document.querySelectorAll('[data-batch-generation] button')].some(button => button.getBoundingClientRect().width > 0 && !button.disabled))
      await page.evaluate(() => [...document.querySelectorAll('[data-batch-generation] button')].find(button => button.getBoundingClientRect().width > 0).click())
      await until(() => calls.some(call => call.source === slug(origin)), 'first request ' + origin)
      await view(page, origin)
    }
    assert.equal(calls.length, 4, '四个栏目必须在任何结果返回前各运行一个任务')
    assert.equal(await page.evaluate(() => window.scopedNavigationToken), 'same-document')
    const first = origin => calls.find(call => call.source === slug(origin) && call.entry === 0)
    const second = origin => calls.find(call => call.source === slug(origin) && call.entry === 1)
    const allIds = (await Promise.all(origins.map(origin => queue(page, origin)))).flat().map(task => task.id)
    assert.equal(new Set(allIds).size, 8, '四栏目同名编辑条目也不得共用结果主键')

    const observer = await s.context.newPage(); await s.wire(observer)
    await observer.evaluateOnNewDocument(() => {
      window.scopedObserverWaiters = []
      const request = navigator.locks.request.bind(navigator.locks)
      navigator.locks.request = (name, options, callback) => request(name, options, async lock => {
        if (!lock) await new Promise(resolve => window.scopedObserverWaiters.push(resolve))
        return callback(lock)
      })
    })
    await observer.goto(BASE + '/generate?source=remix', { waitUntil: 'domcontentloaded' })
    await observer.waitForFunction(() => document.querySelector('[data-generation-view="/remix"]')?.innerText.includes('另一标签页正在执行本栏目'))
    await observer.waitForFunction(() => window.scopedObserverWaiters.length === 4)
    const beforeObserverExit = await Promise.all(origins.map(origin => queue(page, origin)))
    await observer.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    assert.deepEqual(await Promise.all(origins.map(origin => queue(page, origin))), beforeObserverExit, '等待锁的观察标签页离开不能改写原执行页任务')
    await observer.evaluate(() => window.scopedObserverWaiters.forEach(resolve => resolve()))
    assert.equal(calls.length, 4, '观察标签页不能重复执行任何栏目')
    await observer.close()

    await nav(page, '/planner'); await click(page, '/planner', '暂停后续')
    await respond(first('/planner'), '/planner')
    await until(async () => (await queue(page, '/planner'))[0].status === 'success', 'planner first saved')
    assert.equal(second('/planner'), undefined)
    await page.waitForFunction(() => [...document.querySelectorAll('aside [data-nav-key="planner"]')].some(el => el.getBoundingClientRect().width > 0 && el.textContent.includes('待执行')))
    assert.equal((await queue(page, '/simple'))[0].status, 'running')
    await nav(page, '/'); await click(page, '/', '停止本轮')
    await until(async () => (await queue(page, '/'))[0].status === 'interrupted', 'workbench stopped without waiting for provider')
    assert.equal((await queue(page, '/'))[1].stoppedBeforeSend, true)
    assert.equal((await queue(page, '/simple'))[0].status, 'running', '停止工作台不终止其他栏目')
    await page.select('[data-generation-view="/"] [aria-label="任务并发数量"]', '2')
    assert.equal(await page.evaluate(() => localStorage.getItem('amazon-workbench.generateConcurrency.v1.planner')), '1')
    assert.equal(await page.evaluate(() => localStorage.getItem('amazon-workbench.generateConcurrency.v1.workbench')), '2')

    await respond(first('/simple'), '/simple')
    await until(() => second('/simple'), 'simple fills its own next slot')
    await respond(first('/remix'), '/remix')
    await until(() => second('/remix'), 'remix fills its own next slot')
    await respond(second('/remix'), '/remix', true)
    await until(async () => (await queue(page, '/remix'))[1].status === 'interrupted', 'remix uncertainty')
    assert.equal((await queue(page, '/simple'))[1].status, 'running', '一个栏目超时不暂停其他栏目')
    await respond(second('/simple'), '/simple')
    await until(async () => (await queue(page, '/simple')).every(task => task.status === 'success'), 'simple finished')
    await nav(page, '/simple')
    const originalSimpleIds = (await queue(page, '/simple')).map(task => task.id)
    await page.click('[data-generation-view="/simple"] [aria-label="选择任务 1 重绘"]')
    await click(page, '/simple', '重绘所选 1 张')
    await until(() => calls.filter(call => call.source === 'simple' && call.entry === 0).length === 2, 'redraw simple while other scopes pending')
    await respond(calls.filter(call => call.source === 'simple' && call.entry === 0)[1], '/simple')
    await until(async () => (await queue(page, '/simple')).length === 2 && (await queue(page, '/simple')).every(task => task.status === 'success'), 'redraw complete')
    assert.deepEqual((await queue(page, '/simple')).map(task => task.id), originalSimpleIds, '重绘固定原卡片身份/顺序')
    assert.equal(second('/planner'), undefined)
    assert.equal(second('/'), undefined)
    const oldQueues = await Promise.all(origins.slice(0, 3).map(origin => queue(page, origin)))
    await page.screenshot({ path: OUT + '/independent-desktop.png', fullPage: true })
    await page.setViewport({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: OUT + '/independent-mobile.png', fullPage: true })
    await page.setViewport({ width: 1440, height: 1050 })
    await click(page, '/simple', '清空本栏目')
    assert.deepEqual(await queue(page, '/simple'), [])
    assert.deepEqual(await Promise.all(origins.slice(0, 3).map(origin => queue(page, origin))), oldQueues, '清空不能改变其他栏目元数据')
    const beforeReload = calls.length
    await page.reload({ waitUntil: 'networkidle0' })
    assert.equal(calls.length, beforeReload, '刷新不自动继续/补图/重绘任何栏目')
    await nav(page, '/')
    await page.click('[data-generation-view="/"] [data-continue-stopped]')
    await until(() => second('/'), 'explicitly continue workbench only')
    assert.equal(second('/planner'), undefined)
    await respond(second('/'), '/')
    await until(async () => (await queue(page, '/'))[1].status === 'success', 'workbench unsent task completed')
    assert.equal((await queue(page, '/'))[0].status, 'interrupted', '继续未发送任务不重发已提交待确认项')
    const resultImages = await page.evaluate(async keys => {
      const db = await new Promise(resolve => { const r = indexedDB.open('amazon-workbench-results', 1); r.onsuccess = () => resolve(r.result) })
      const result = []
      for (const storageKey of keys) for (const task of JSON.parse(localStorage.getItem(storageKey) || '[]')) if (task.status === 'success') {
        const urls = await new Promise(resolve => { const r = db.transaction('task-results').objectStore('task-results').get(task.id); r.onsuccess = () => resolve(r.result) })
        result.push({ origin: task.origin, urls })
      }
      db.close(); return result
    }, origins.slice(0, 3).map(key))
    for (const result of resultImages) assert.deepEqual(result.urls, [images[origins.indexOf(result.origin)]], '结果始终属于原栏目')
    assert.deepEqual(s.errors, [])
    reports.push({ scenario: 'four-concurrent-scopes', concurrentLogicalTasks: 4, metadataTasks: 8, finalMockCalls: calls.length, pauseStopConcurrencyAndUncertaintyIsolated: true, redrawIsolated: true, clearIsolated: true, reloadNoResend: true, continueOnlyChosenScope: true, observerDuplicates: 0, observerExitNeverChangesOwner: true, mobile: true })
    await s.context.close()

    const legacy = await surface()
    await seed(legacy.page)
    await legacy.page.evaluate(async image => {
      const old = [
        { id: 'old-plan', origin: '/planner', status: 'success', count: 2, resultUrls: [image] },
        { id: 'old-simple', origin: '/simple', status: 'interrupted', count: 1, resultUrls: [] },
        { id: 'old-remix', origin: '/remix', status: 'queued', count: 1, resultUrls: [] },
      ].map(task => ({ label: task.id, ratio: '1:1', quality: '1k', customSize: '', prompt: '旧完整提示词', productImageDataUrl: '', inputBatchId: 'shared-legacy', ...task }))
      localStorage.setItem('amazon-workbench.generateQueue', JSON.stringify(old))
      localStorage.setItem('amazon-workbench.generateOrigin', '/planner')
      const db = await new Promise(resolve => { const r = indexedDB.open('amazon-workbench-inputs', 1); r.onupgradeneeded = () => r.result.createObjectStore('records'); r.onsuccess = () => resolve(r.result) })
      await new Promise(resolve => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put({ images: [image], tasks: old.map(task => ({ id: task.id, product: 0, references: [] })) }, 'shared-legacy'); tx.oncomplete = resolve })
      db.close()
    }, images[1])
    await legacy.page.goto(BASE + '/generate?source=planner', { waitUntil: 'networkidle0' })
    await legacy.page.waitForSelector('[data-generation-view="/planner"] [data-generation-task="old-plan"]')
    assert.equal(legacy.calls.length, 0)
    await nav(legacy.page, '/simple')
    await legacy.page.waitForSelector('[data-generation-view="/simple"] [data-generation-task="old-simple"]')
    assert.equal(await legacy.page.$$eval('[data-generation-view="/simple"] [data-generation-task]', tasks => tasks.length), 1)
    await nav(legacy.page, '/planner'); await click(legacy.page, '/planner', '清空本栏目')
    const sharedKept = await legacy.page.evaluate(async () => {
      const db = await new Promise(resolve => { const r = indexedDB.open('amazon-workbench-inputs', 1); r.onsuccess = () => resolve(r.result) })
      const value = await new Promise(resolve => { const r = db.transaction('records').objectStore('records').get('shared-legacy'); r.onsuccess = () => resolve(Boolean(r.result)) }); db.close(); return value
    })
    assert.equal(sharedKept, true)
    await legacy.page.reload({ waitUntil: 'networkidle0' })
    assert.deepEqual(await queue(legacy.page, '/planner'), [])
    assert.equal(legacy.calls.length, 0)
    assert.deepEqual(legacy.errors, [])
    reports.push({ scenario: 'legacy-mixed-queue', resultScopeCorrect: true, oldPendingNeverSent: true, sharedInputsKept: true, clearedScopeNeverRevived: true })
    await legacy.context.close()
    fs.writeFileSync(OUT + '/results.json', JSON.stringify({ baseURL: BASE, browser: 'isolated headless Edge', reports, realPaidRequests: 0 }, null, 2))
    console.log('PASS: 四栏目同时执行；结果/暂停/停止/并发/重绘/清空完全隔离；同栏目多标签防重复；刷新不重发且只继续指定栏目；旧混合任务与共享图片兼容（全模拟）')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
