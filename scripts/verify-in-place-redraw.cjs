// Isolated Edge, synthetic pictures and intercepted responses only; no user profile or real model calls.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/in-place-redraw-20261019/local')
const origins = ['/', '/planner', '/remix', '/simple']
const slug = origin => origin === '/' ? 'workbench' : origin.slice(1)
const key = origin => 'amazon-workbench.generateQueue.v2.' + slug(origin)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) { const end = Date.now() + 20000; while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(30) } }
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const images = await Promise.all(['#be5858', '#58be58', '#5858be', '#ebcb60', '#ab60cb', '#60cbcb'].map(async color => 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).png().toBuffer()).toString('base64')))
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox', '--disable-background-timer-throttling'] })
  const calls = [], errors = [], reports = []
  try {
    const context = await browser.createBrowserContext(), page = await context.newPage()
    await page.setViewport({ width: 1440, height: 1050 })
    page.on('pageerror', error => errors.push(error.message))
    await page.evaluateOnNewDocument(() => {
      const original = window.fetch
      window.fetch = (url, init) => {
        if (String(url) === '/api/images' && init?.body instanceof FormData) {
          const body = init.body, headers = new Headers(init.headers)
          headers.set('x-redraw-test', encodeURIComponent(JSON.stringify({ prompt: body.get('prompt'), count: body.get('imageCount'), products: body.get('productImageCount'), files: body.getAll('images').map(file => file.name), ratio: body.get('ratio') })))
          return original.call(window, url, { ...init, headers })
        }
        return original.call(window, url, init)
      }
    })
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
      if (url.pathname === '/api/images') { calls.push({ request, trace: JSON.parse(decodeURIComponent(request.headers()['x-redraw-test'] || '%7B%7D')), settled: false }); return }
      if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
      void request.continue().catch(() => {})
    })
    const queue = origin => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), key(origin))
    const urls = async origin => page.evaluate(async origin => {
      const task = JSON.parse(localStorage.getItem('amazon-workbench.generateQueue.v2.' + (origin === '/' ? 'workbench' : origin.slice(1))))[0]
      if (!task.resultsSaved) return task.resultUrls
      return new Promise((resolve, reject) => {
        const open = indexedDB.open('amazon-workbench-results', 1)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => { const db = open.result, request = db.transaction('task-results').objectStore('task-results').get(task.id); request.onsuccess = () => { resolve(request.result); db.close() }; request.onerror = () => { reject(request.error); db.close() } }
      })
    }, origin)
    async function button(origin, text, twice = false) {
      await page.evaluate(({ origin, text, twice }) => {
        const button = [...document.querySelector(`[data-generation-view="${origin}"]`).querySelectorAll('button')].find(button => button.textContent.trim() === text)
        if (!button || button.disabled) throw Error('Missing/disabled: ' + text)
        button.click(); if (twice) button.click()
      }, { origin, text, twice })
    }
    async function select(origin, index) {
      const card = `[data-generation-view="${origin}"] [data-generation-task="original-${slug(origin)}"]`
      await page.click(card + ` [aria-label="查看第 ${index + 1} 张图片"]`)
      await page.click(card + ` [aria-label="选择任务 1 的第 ${index + 1} 张重绘"]`)
    }
    async function respond(index, src, status = 200) {
      const call = calls[index]; assert.ok(call && !call.settled); call.settled = true
      await call.request.respond({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { images: [{ src }] } : { error: 'MOCK_REDRAW_' + status, outcome: status === 400 ? 'failed' : 'interrupted' }) })
    }
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
    await page.evaluate(async ({ images, origins }) => {
      const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-in-place-only', model: 'gpt-image-2' }
      localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ image: connection, analysis: connection }))
      localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
      for (const origin of origins) {
        const source = origin === '/' ? 'workbench' : origin.slice(1)
        const base = { origin, label: '测试完整提示词', ratio: 'custom', customSize: '5:4', quality: '1k', status: 'success', prompt: 'IN_PLACE_' + source + ' 完整商品约束与负向提示词，商品尺寸12cm。', productImageDataUrl: images[0], productImages: [{ dataUrl: images[0], name: '主产品.png' }, { dataUrl: images[1], name: '产品补充.png' }], references: [{ dataUrl: images[2], name: '竞品.png' }] }
        localStorage.setItem('amazon-workbench.generateQueue.v2.' + source, JSON.stringify([
          { ...base, id: 'original-' + source, count: 3, resultUrls: images.slice(0, 3), resultCount: 3 },
          { ...base, id: 'historical-' + source, count: 1, resultUrls: [images[5]], redrawOf: 'original-' + source, redrawIndices: [0] },
        ]))
      }
    }, { images, origins })
    for (const origin of origins) {
      await page.goto(BASE + '/generate?source=' + slug(origin), { waitUntil: 'networkidle0' })
      await page.waitForFunction(origin => { const scope = document.querySelector(`[data-generation-view="${origin}"]`); return scope && [...scope.querySelectorAll('[aria-label="选择任务 1 重绘"]')].some(el => !el.disabled) }, {}, origin)
      const otherScopes = await Promise.all(origins.filter(value => value !== origin).map(queue))
      const before = await queue(origin), callIndex = calls.length
      await select(origin, 1)
      await button(origin, '重绘所选 1 张', true)
      await until(() => calls.length === callIndex + 1, 'single redraw request ' + origin)
      assert.deepEqual((await queue(origin)).map(task => task.id), before.map(task => task.id))
      assert.deepEqual(await urls(origin), images.slice(0, 3), '返回前显示旧图')
      assert.equal(calls[callIndex].trace.count, '1')
      assert.equal(calls[callIndex].trace.products, '2')
      assert.deepEqual(calls[callIndex].trace.files, ['主产品.png', '产品补充.png', '竞品.png'])
      assert.ok(calls[callIndex].trace.prompt.includes('完整商品约束与负向提示词'))
      assert.ok(calls[callIndex].trace.prompt.includes('12cm'))
      assert.equal(calls[callIndex].trace.ratio, 'custom')
      await respond(callIndex, images[3])
      await until(async () => (await queue(origin))[0].status === 'success', 'single redraw complete')
      assert.deepEqual(await urls(origin), [images[0], images[3], images[2]])
      assert.deepEqual((await queue(origin)).map(task => task.id), before.map(task => task.id))
      assert.equal((await queue(origin))[0].count, 3)
      assert.equal((await queue(origin))[1].redrawOf, before[1].redrawOf, '历史追加记录仍保留')
      assert.deepEqual(await Promise.all(origins.filter(value => value !== origin).map(queue)), otherScopes, '其他栏目完全不变')
      assert.equal(await page.$eval(`[data-generation-view="${origin}"] [data-task-gallery="original-${slug(origin)}"] [aria-label="查看第 2 张图片"]`, el => el.getAttribute('aria-pressed')), 'true', '重绘后保留当前预览图号')
      reports.push({ origin, sameTaskIdAndPosition: true, onlySelectedImageReplaced: true, duplicateClickSingleRequest: true, originalInputsRetained: true, otherScopesUnchanged: true, historicalCardsPreserved: true })
    }
    const origin = '/simple'
    // A local save rejection must prevent all paid requests and preserve the original record.
    await select(origin, 0)
    const beforeFailure = await queue(origin), beforeFailureCalls = calls.length
    await page.evaluate(() => { window.originalStorageSet = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'amazon-workbench.generateQueue.v2.simple') throw Error('MOCK_STORAGE_FULL'); return window.originalStorageSet.call(this, key, value) } })
    await button(origin, '重绘所选 1 张')
    await until(() => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].some(el => el.textContent.includes('重绘任务保存失败'))), 'save rejection')
    assert.equal(calls.length, beforeFailureCalls)
    assert.deepEqual(await queue(origin), beforeFailure)
    await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageSet })
    await select(origin, 2)
    const start = calls.length
    await button(origin, '重绘所选 2 张')
    await until(() => calls.length === start + 2, 'two parallel redraw requests')
    await respond(start + 1, images[4])
    await until(async () => (await urls(origin))[2] === images[4], 'out of order checkpoint')
    assert.deepEqual(await urls(origin), [images[0], images[3], images[4]])
    await respond(start, null, 400)
    await until(async () => (await queue(origin))[0].status === 'failed', 'partial redraw rejected')
    assert.deepEqual((await queue(origin))[0].redraw.pending, [0])
    assert.deepEqual(await urls(origin), [images[0], images[3], images[4]], '失败图保留旧图，成功图原位更新')
    await page.screenshot({ path: OUT + '/partial-failure-original-kept.png', fullPage: true })
    await button(origin, '重试未完成的 1 张重绘')
    await until(() => calls.length === start + 3, 'retry unresolved only')
    await respond(start + 2, null, 504)
    await until(async () => (await queue(origin))[0].status === 'interrupted', 'uncertain redraw')
    const beforeReload = calls.length
    await page.reload({ waitUntil: 'networkidle0' }); await delay(350)
    assert.equal(calls.length, beforeReload, '刷新不重发待确认重绘')
    assert.deepEqual(await urls(origin), [images[0], images[3], images[4]])
    page.once('dialog', dialog => dialog.dismiss())
    await button(origin, '重试未完成的 1 张重绘'); await delay(200)
    assert.equal(calls.length, beforeReload, '取消确认不发送')
    page.once('dialog', dialog => dialog.accept())
    await button(origin, '重试未完成的 1 张重绘')
    await until(() => calls.length === beforeReload + 1, 'explicit retry confirmed')
    await respond(beforeReload, images[5])
    await until(async () => (await queue(origin))[0].status === 'success', 'retry complete')
    assert.deepEqual(await urls(origin), [images[5], images[3], images[4]])
    // Reload during an active redraw leaves a pending slot and never resubmits it.
    await select(origin, 1)
    const activeCall = calls.length
    await button(origin, '重绘所选 1 张')
    await until(() => calls.length === activeCall + 1, 'active redraw')
    await page.reload({ waitUntil: 'networkidle0' }); await delay(350)
    assert.equal(calls.length, activeCall + 1)
    assert.equal((await queue(origin))[0].status, 'interrupted')
    assert.deepEqual((await queue(origin))[0].redraw.pending, [1])
    assert.deepEqual(await urls(origin), [images[5], images[3], images[4]])
    page.once('dialog', dialog => dialog.accept())
    await button(origin, '重试未完成的 1 张重绘')
    await until(() => calls.length === activeCall + 2, 'manual retry after active reload')
    await respond(activeCall + 1, images[0])
    await until(async () => (await queue(origin))[0].status === 'success', 'recovered redraw done')
    assert.deepEqual(await urls(origin), [images[5], images[0], images[4]])
    assert.equal((await queue(origin)).length, 2)
    await page.screenshot({ path: OUT + '/same-position-desktop.png', fullPage: true })
    await page.setViewport({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: OUT + '/same-position-mobile.png', fullPage: true })
    assert.deepEqual(errors, [])
    reports.push({ scenario: 'partial-and-recovery', outOfOrderSlots: true, failedSlotOldImageKept: true, retryOnlyPending: true, refreshNeverResends: true, cancelledConfirmationNoSend: true, storageFailureNoSend: true, activeReloadOldImageRetained: true, mobileNoOverflow: true })
    fs.writeFileSync(OUT + '/results.json', JSON.stringify({ baseURL: BASE, browser: 'isolated headless Edge', modelCalls: calls.length, realPaidRequests: 0, reports, errors }, null, 2))
    console.log('PASS: 四栏目原位单张重绘、不增卡/不移位、乱序/部分失败/手动重试、刷新零重发、保存失败零发送、完整素材与历史记录兼容（全模拟）')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
