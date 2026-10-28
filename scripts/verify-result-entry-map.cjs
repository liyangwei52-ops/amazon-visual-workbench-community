// Synthetic assets in isolated Edge; all model calls are intercepted, never charged.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/result-entry-map-20261020/local')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) { const end = Date.now() + 25000; while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(40) } }
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const images = await Promise.all(['#88bbcc', '#dd99aa', '#bbcc88'].map(async background => 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background } }).png().toBuffer()).toString('base64')))
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] })
  const reports = [], errors = []
  try {
    for (const origin of ['/simple', '/', '/remix', '/planner']) {
      const source = origin === '/' ? 'workbench' : origin.slice(1), key = 'amazon-workbench.generateQueue.v2.' + source
      const draftKey = origin === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.' + source
      const scope = `[data-generation-view="${origin}"]`
      const context = await browser.createBrowserContext(), page = await context.newPage(), calls = []
      await page.setViewport({ width: 1440, height: 1050 })
      page.on('pageerror', error => errors.push(error.message))
      await page.evaluateOnNewDocument(() => {
        const original = window.fetch
        window.fetch = (url, init) => {
          if (String(url) === '/api/images' && init?.body instanceof FormData) {
            const form = init.body, headers = new Headers(init.headers)
            headers.set('x-entry-map-test', encodeURIComponent(JSON.stringify({ prompt: form.get('prompt'), n: form.get('imageCount'), files: form.getAll('images').map(f => f.name) })))
            return original.call(window, url, { ...init, headers })
          }
          return original.call(window, url, init)
        }
      })
      await page.setRequestInterception(true)
      page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
        if (url.pathname === '/api/images') { calls.push({ request, trace: JSON.parse(decodeURIComponent(request.headers()['x-entry-map-test'])) }); return }
        if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
        void request.continue().catch(() => {})
      })
      await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
      await page.evaluate(async ({ origin, key, draftKey, images }) => {
        const config = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-entry-map-only', model: 'gpt-image-2' }
        localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ image: config, analysis: config }))
        localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
        const tasks = [1, 2, 3].map(n => ({ id: 'legacy-result-' + n, sourceEntryId: 'editor-' + n, origin, inputBatchId: 'legacy-inputs', label: '旧提示词' + n, count: 1, ratio: '1:1', quality: '1k', customSize: '', prompt: 'OLD_PRODUCT_' + n, status: 'success', resultUrls: [images[n - 1]], productImageDataUrl: '' }))
        localStorage.setItem(key, JSON.stringify(tasks))
        const entry = { id: 'editor-1', title: '当前商品', enabled: true, prompt: 'CURRENT_PRODUCT_1 金色耳饰，仅当前第1框', extraNeeds: '商品展示', references: [], size: '1:1', ratio: '1:1', quality: '1k', customSize: '', count: '1' }
        localStorage.setItem(draftKey, JSON.stringify({ generationMode: 'image', productImages: [{ id: 'new-product', name: 'current-product.png', dataUrl: images[2] }], ...(origin === '/' ? { cards: [entry] } : { entries: [entry] }) }))
        await new Promise((resolve, reject) => { const open = indexedDB.open('amazon-workbench-inputs', 1); open.onupgradeneeded = () => open.result.createObjectStore('records'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put({ images: [images[0]], tasks: tasks.map(t => ({ id: t.id, product: 0, references: [] })) }, 'legacy-inputs'); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error) } })
      }, { origin, key, draftKey, images })
      const queue = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
      const resultUrl = BASE + '/generate?source=' + source
      async function slots(ids) {
        await until(async () => JSON.stringify(await page.$$eval(scope + ' [data-result-entry]', els => els.map(el => el.dataset.resultEntry))) === JSON.stringify(ids), 'slots ' + ids)
        assert.deepEqual(await page.$$eval(scope + ' [data-result-position]', els => els.map(el => Number(el.dataset.resultPosition))), ids.map((_, i) => i + 1))
      }
      async function submit() {
        await page.goto(BASE + origin, { waitUntil: 'networkidle0' })
        await page.waitForFunction(() => [...document.querySelectorAll('[data-batch-generation] button')].some(el => !el.disabled && el.getBoundingClientRect().width > 0))
        await page.evaluate(() => [...document.querySelectorAll('[data-batch-generation] button')].find(el => !el.disabled && el.getBoundingClientRect().width > 0).click())
      }
      async function reply(index, color) { await calls[index].request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: images[color] }] }) }) }
      async function editList(ids, enabledId, count = '1') {
        // Full reload re-reads a synthetic editor snapshot; production logic performs every actual submit.
        await page.evaluate(({ origin, draftKey, ids, enabledId, count }) => {
          const draft = JSON.parse(localStorage.getItem(draftKey)), old = new Map((origin === '/' ? draft.cards : draft.entries).map(e => [e.id, e]))
          const entries = ids.map(id => ({ ...(old.get(id) || { id, title: id, references: [], extraNeeds: '商品展示', size: '1:1', ratio: '1:1', quality: '1k', customSize: '' }), enabled: id === enabledId, count: id === enabledId ? count : '1', prompt: 'CURRENT_' + id + '_' + ids.join('-') }))
          if (origin === '/') draft.cards = entries; else draft.entries = entries
          localStorage.setItem(draftKey, JSON.stringify(draft))
        }, { origin, draftKey, ids, enabledId, count })
      }
      const before = JSON.stringify(await queue())
      await page.goto(resultUrl, { waitUntil: 'networkidle0' })
      await slots(['editor-1'])
      assert.equal(calls.length, 0, '旧混合结果修正展示不需要再次计费')
      assert.equal(JSON.stringify(await queue()), before, '只读投影不改写旧队列')
      await page.select(scope + ' [aria-label="查看生成批次"]', 'legacy-inputs')
      await slots(['editor-2', 'editor-3'])
      assert.equal(calls.length, 0)
      await submit(); await until(() => calls.length === 1, 'submit only current one')
      await slots(['editor-1'])
      assert.equal((await queue()).length, 3, '被移除旧卡保留历史')
      await reply(0, 2); await until(async () => (await queue()).every(t => t.status === 'success'), 'one done')
      const currentId = (await queue()).find(t => t.sourceEntryId === 'editor-1').id
      assert.equal(currentId, 'legacy-result-1', '对应结果原位更新')
      const five = ['editor-1', 'editor-2', 'editor-3', 'editor-4', 'editor-5']
      await editList(five, 'editor-3', '2')
      await page.reload({ waitUntil: 'networkidle0' })
      await slots(five)
      assert.equal(await page.$$eval(scope + ' [data-result-unsubmitted]', els => els.length), 4, '未提交框只占位，历史同名条目不能串回来')
      assert.equal(calls.length, 1)
      await submit(); await until(() => calls.length === 3, 'third group two images')
      await slots(five)
      assert.equal(await page.$$eval(scope + ' [data-generation-task]', els => els.length), 2, '五个框只有两组实际任务，其余占位')
      assert.equal(await page.$$eval(scope + ' [data-result-unsubmitted]', els => els.length), 3)
      for (const index of [1, 2]) { assert.ok(calls[index].trace.prompt.includes('CURRENT_editor-3')); await reply(index, 1) }
      await until(async () => (await queue()).every(t => t.status === 'success'), 'third two received')
      const active = (await queue()).filter(t => t.generationEntryIds?.length === 5)
      assert.deepEqual(active.map(t => t.sourceEntryId), ['editor-1', 'editor-3'])
      assert.equal(active.find(t => t.sourceEntryId === 'editor-1').id, currentId)
      const thirdId = active.find(t => t.sourceEntryId === 'editor-3').id
      assert.notEqual(thirdId, 'legacy-result-3', '不能关联已移出清单的历史同名卡')
      await editList(['editor-5', 'editor-3', 'editor-1'], 'editor-3')
      await page.reload({ waitUntil: 'networkidle0' }); await slots(['editor-5', 'editor-3', 'editor-1'])
      assert.equal(calls.length, 3, '调整顺序不会自动提交')
      await submit(); await until(() => calls.length === 4, 'reordered third only')
      await slots(['editor-5', 'editor-3', 'editor-1'])
      assert.ok(await page.$(scope + ` [data-generation-task="${thirdId}"][data-result-position="2"]`))
      await reply(3, 0); await until(async () => (await queue()).every(t => t.status === 'success'), 'reorder done')
      // Delete through the real editor and switch its sidebar in the same app session.
      const queueBeforeDelete = JSON.stringify(await queue())
      await page.goto(BASE + origin, { waitUntil: 'networkidle0' })
      await page.waitForSelector('.entry-grid [data-prompt-preview]')
      await page.evaluate(() => {
        const preview = [...document.querySelectorAll('.entry-grid [data-prompt-preview]')][2]
        if (!preview) throw Error('Missing third editor')
        const grid = preview.closest('.entry-grid'); let card = preview
        while (card.parentElement !== grid) card = card.parentElement
        const button = card.querySelector('button[aria-label^="删除请求"], button[aria-label="删除本条"], button:has(svg.lucide-trash-2)')
        if (!button || button.disabled) throw Error('Missing delete button')
        button.click()
      })
      await until(() => page.evaluate(({ origin, draftKey }) => { const d = JSON.parse(localStorage.getItem(draftKey)); return (origin === '/' ? d.cards : d.entries).map(e => e.id).join(',') === 'editor-5,editor-3' }, { origin, draftKey }), 'real delete draft saved')
      await page.evaluate(href => {
        const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === href && a.getBoundingClientRect().width > 0)
        if (!link) throw Error('Missing source result navigation')
        link.click()
      }, '/generate?source=' + source)
      await slots(['editor-5', 'editor-3'])
      assert.equal(JSON.stringify(await queue()), queueBeforeDelete, '同页删框导航只投影，不改写队列')
      assert.equal(calls.length, 4, '同页删框导航零请求')
      await submit(); await until(() => calls.length === 5, 'remove first current card')
      await slots(['editor-5', 'editor-3'])
      assert.equal(await page.$$eval(scope + ' [data-generation-task]', els => els.length), 1)
      await reply(4, 2); await until(async () => (await queue()).every(t => t.status === 'success'), 'final done')
      assert.ok((await queue()).some(t => t.id === currentId && t.resultCount > 0), '被移除框的旧图仍保留')
      await page.reload({ waitUntil: 'networkidle0' }); await slots(['editor-5', 'editor-3'])
      assert.equal(calls.length, 5, '刷新零重发')
      assert.ok(calls.every(call => call.trace.n === '1' && call.trace.files[0] === 'current-product.png'))
      await page.screenshot({ path: OUT + '/' + source + '-desktop.png', fullPage: true })
      await page.setViewport({ width: 390, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.screenshot({ path: OUT + '/' + source + '-mobile.png', fullPage: true })
      reports.push({ origin, mockImageCalls: calls.length, legacyThreeToOneReadOnly: true, removedResultsInHistory: true, oneBoxOneGroup: true, thirdBoxTwoImages: true, disabledPlaceholdersNoSubmit: true, editorOrderPreserved: true, realDeleteAndSidebarSynchronized: true, stableTaskIds: true, oldPicturesPreserved: true, noRefreshResend: true, mobileNoOverflow: true })
      await context.close()
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(OUT + '/results.json', JSON.stringify({ baseURL: BASE, reports, errors, mockImageCalls: 20, realPaidRequests: 0 }, null, 2))
    console.log('PASS: 四入口旧3→当前1只读修正、完整框位/未提交占位、第三框2张仍1组、删除/重排/历史隔离、素材/旧图保留和刷新零重发（20次全模拟）')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
