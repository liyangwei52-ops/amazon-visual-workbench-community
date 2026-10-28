// Isolated Edge, synthetic images and intercepted model endpoints. Zero real provider calls.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/incremental-submit-20261019/local')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) { const end = Date.now() + 20000; while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(30) } }
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const images = await Promise.all(['#aaccdd', '#eeaaaa', '#aaddaa', '#ddcc88'].map(async color => 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).png().toBuffer()).toString('base64')))
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox', '--disable-background-timer-throttling'] })
  const reports = [], errors = []
  try {
    for (const origin of ['/simple', '/', '/remix', '/planner']) {
      const context = await browser.createBrowserContext(), page = await context.newPage(), calls = []
      const source = origin === '/' ? 'workbench' : origin.slice(1), key = 'amazon-workbench.generateQueue.v2.' + source
      const scope = `[data-generation-view="${origin}"]`
      await page.setViewport({ width: 1440, height: 1050 })
      page.on('pageerror', error => errors.push(error.message))
      await page.evaluateOnNewDocument(() => {
        const original = window.fetch
        window.fetch = (url, init) => {
          if (String(url) === '/api/images' && init?.body instanceof FormData) {
            const headers = new Headers(init.headers), form = init.body
            headers.set('x-incremental-test', encodeURIComponent(JSON.stringify({ prompt: form.get('prompt'), n: form.get('imageCount'), files: form.getAll('images').map(file => file.name) })))
            return original.call(window, url, { ...init, headers })
          }
          return original.call(window, url, init)
        }
      })
      await page.setRequestInterception(true)
      page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
        if (url.pathname === '/api/images') { calls.push({ request, trace: JSON.parse(decodeURIComponent(request.headers()['x-incremental-test'])), settled: false }); return }
        if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
        void request.continue().catch(() => {})
      })
      await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
      await page.evaluate(({ origin, source, image }) => {
        const config = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-incremental-only', model: 'gpt-image-2' }
        localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ image: config, analysis: config }))
        localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
        const entries = Array.from({ length: 5 }, (_, i) => ({ id: 'editor-' + (i + 1), title: '版位' + (i + 1), enabled: true, prompt: 'ORIGINAL_' + (i + 1) + ' 完整商品约束', extraNeeds: '商品展示', references: [], size: '1:1', ratio: '1:1', quality: '1k', customSize: '', count: '1' }))
        localStorage.setItem(origin === '/' ? 'amazon-workbench.draft.workbench' : origin === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.' + source, JSON.stringify({ generationMode: 'image', productImages: [{ id: 'product', name: 'synthetic.png', dataUrl: image }], ...(origin === '/' ? { cards: entries } : { entries }) }))
      }, { origin, source, image: images[0] })
      const queue = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), key)
      const urls = () => page.evaluate(async key => {
        const queue = JSON.parse(localStorage.getItem(key) || '[]')
        const open = indexedDB.open('amazon-workbench-results', 1)
        const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
        const values = await Promise.all(queue.map(task => new Promise(resolve => { const read = db.transaction('task-results').objectStore('task-results').get(task.id); read.onsuccess = () => resolve(read.result || task.resultUrls) })))
        db.close(); return values
      }, key)
      async function resultButton(label) { await page.evaluate(({ scope, label }) => { const button = [...document.querySelector(scope).querySelectorAll('button')].find(el => el.textContent.trim() === label); if (!button || button.disabled) throw Error('Missing/disabled: ' + label); button.click() }, { scope, label }) }
      async function submit() {
        await page.waitForFunction(() => [...document.querySelectorAll('[data-batch-generation] button')].some(el => !el.disabled && el.getBoundingClientRect().width > 0))
        await page.evaluate(() => [...document.querySelectorAll('[data-batch-generation] button')].find(el => el.getBoundingClientRect().width > 0).click())
      }
      async function edit(indices, text) {
        await page.goto(BASE + origin, { waitUntil: 'networkidle0' })
        await page.waitForSelector('.entry-grid [data-prompt-preview]')
        await page.evaluate(({ indices, text }) => {
          const previews = [...document.querySelectorAll('.entry-grid [data-prompt-preview]')]
          const grid = previews[0].closest('.entry-grid'), enabled = [...grid.querySelectorAll('input[type="checkbox"]')]
          if (enabled.length !== 5 || previews.length !== 5) throw Error('Wrong input count')
          enabled.forEach((input, i) => { if (input.checked !== indices.includes(i)) input.click() })
          if (text) {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(previews[indices[0]], text)
            previews[indices[0]].dispatchEvent(new Event('input', { bubbles: true }))
          }
        }, { indices, text })
      }
      async function reply(index, color) { calls[index].settled = true; await calls[index].request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: images[color] }] }) }) }
      async function fiveCards(ids) {
        await until(() => page.$eval(scope + ' [data-generation-batches]', el => el.textContent.includes('计划 5 张')), 'five images still visible')
        assert.deepEqual(await page.$$eval(scope + ' [data-generation-task]', els => els.map(el => el.dataset.generationTask)), ids)
      }
      await page.goto(BASE + origin, { waitUntil: 'networkidle0' })
      await submit(); await until(() => calls.length === 5, 'first five')
      for (let i = 0; i < 5; i++) await reply(i, 0)
      await until(async () => (await queue()).every(task => task.status === 'success'), 'first complete')
      const first = await queue(), ids = first.map(task => task.id)
      const otherFour = JSON.stringify(first.filter(task => task.sourceEntryId !== 'editor-3'))
      await edit([2], 'EDIT_THIRD 完整提示词保留，只有第三条改变')
      await submit(); await until(() => calls.length === 6, 'only edited third submitted')
      await fiveCards(ids)
      assert.ok(calls[5].trace.prompt.includes('EDIT_THIRD'))
      assert.equal(JSON.stringify((await queue()).filter(task => task.sourceEntryId !== 'editor-3')), otherFour)
      assert.deepEqual((await urls()).map(group => group[0]), Array(5).fill(images[0]), '新图未返回前旧图仍在')
      await reply(5, 1)
      await until(async () => (await queue())[2].status === 'success', 'third complete')
      assert.deepEqual((await urls()).map(group => group[0]), [images[0], images[0], images[1], images[0], images[0]])
      // Re-run all five with concurrency one, then stop after first returned and second started.
      await page.select(scope + ' [aria-label="任务并发数量"]', '1')
      await edit([0, 1, 2, 3, 4])
      await submit(); await until(() => calls.length === 7, 'one worker')
      await reply(6, 2); await until(() => calls.length === 8, 'second starts after first checkpoint')
      const started = Date.now()
      await resultButton('停止本轮')
      await until(async () => !(await queue()).some(task => task.status === 'running' || task.status === 'queued'), 'stop releases blockers')
      const stopMs = Date.now() - started, stopped = await queue()
      assert.ok(stopMs < 3000, '无需等待模型生成完毕')
      assert.deepEqual(stopped.map(task => task.status), ['success', 'interrupted', 'failed', 'failed', 'failed'])
      assert.deepEqual(stopped.map(task => Boolean(task.stoppedBeforeSend)), [false, false, true, true, true])
      assert.equal(calls.length, 8)
      await fiveCards(ids)
      assert.deepEqual((await urls()).map(group => group[0]), [images[2], images[0], images[1], images[0], images[0]])
      await edit([2], 'AFTER_STOP_THIRD 停止后立即修改第三条')
      await submit(); await until(() => calls.length === 9, 'resubmit third after stop')
      await fiveCards(ids)
      assert.ok(calls[8].trace.prompt.includes('AFTER_STOP_THIRD'))
      assert.equal((await queue())[1].status, 'interrupted', '未选的已提交请求不会重新发送')
      await reply(8, 3); await until(async () => (await queue())[2].status === 'success', 'resubmitted third done')
      // A late response from the canceled second request must never overwrite the new state.
      await reply(7, 3).catch(() => {})
      await page.reload({ waitUntil: 'networkidle0' })
      await fiveCards(ids)
      assert.equal(calls.length, 9, '刷新不重发')
      assert.deepEqual((await urls()).map(group => group[0]), [images[2], images[0], images[3], images[0], images[0]])
      await resultButton('继续未发送任务（2 条）')
      await until(() => calls.length === 10, 'explicit continue fourth')
      await reply(9, 2); await until(() => calls.length === 11, 'explicit continue fifth')
      await reply(10, 2); await until(async () => (await queue())[4].status === 'success', 'continued done')
      assert.equal((await queue())[1].status, 'interrupted')
      await edit([1], 'RETRY_SECOND 核查后重新提交')
      page.once('dialog', dialog => dialog.dismiss())
      await submit(); await delay(250)
      assert.equal(calls.length, 11, '取消待确认提交零请求')
      assert.ok(!page.url().includes('/generate'), '取消保留编辑页面')
      page.once('dialog', dialog => dialog.accept())
      await submit(); await until(() => calls.length === 12, 'confirmed second')
      await reply(11, 3); await until(async () => (await queue()).every(task => task.status === 'success'), 'all complete')
      await fiveCards(ids)
      assert.deepEqual((await urls()).map(group => group[0]), [images[2], images[3], images[3], images[2], images[2]])
      assert.ok(calls.every(call => call.trace.n === '1' && call.trace.files.length === 1), '每张n=1且素材完整')
      await page.screenshot({ path: OUT + '/' + source + '-desktop.png', fullPage: true })
      await page.setViewport({ width: 390, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: OUT + '/' + source + '-mobile.png', fullPage: true })
      reports.push({ origin, mockCalls: calls.length, firstCount: 5, finalCount: 5, onlyThirdResubmitted: true, otherFourRetained: true, inPlaceIdsAndOrder: true, stopMs, stopUnsentVsUnknown: true, resubmitWithoutUpstreamWait: true, explicitContinueOnlyUnsent: true, cancelledConfirmationNoSend: true, lateResponseIgnored: true, refreshNoResend: true, mobileNoOverflow: true })
      await context.close()
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(OUT + '/results.json', JSON.stringify({ baseURL: BASE, reports, mockCalls: reports.reduce((n, r) => n + r.mockCalls, 0), realPaidRequests: 0, errors }, null, 2))
    console.log('PASS: 四入口5张仅改第3条/其余保留、停止立即重交、未发送显式继续、待确认取消/确认、迟到响应不覆盖、刷新零重发（48次全模拟）')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
