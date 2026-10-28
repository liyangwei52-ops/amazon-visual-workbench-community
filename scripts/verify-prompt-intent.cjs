// Isolated Edge, synthetic assets, fake key, every model endpoint intercepted. No paid calls.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/prompt-intent-20261019/local-images')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) { const end = Date.now() + 20000; while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(40) } }
const scenes = [
  '女儿（16岁）父亲（45岁）在画面左侧互相拥抱安慰，右侧为窗户，画面明亮。',
  '2×2四宫格背景素材：左上后花园，右上室内盆栽；左下父子在左侧、右侧窗户；右下父女拥抱在左侧、右侧窗户。远景，每格前景预留空白便于后期添加产品；无任何文字、无水印、无标签。',
  '商品展示：只拍新商品中的笔，三个局部细节框来自同一支笔。商品尺寸12×80cm。上图文案“Alles Gute!”与“Happy Birthday”各一次；原印花保留，禁止新增配件。',
]
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const img = 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background: '#cce0dd' } }).png().toBuffer()).toString('base64')
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] })
  const reports = [], errors = []
  try {
    for (const model of ['gpt-image-2', 'gemini-3-pro-image-preview']) {
      for (const route of ['/', '/remix', '/planner', '/simple']) {
        const source = route === '/' ? 'workbench' : route.slice(1)
        const context = await browser.createBrowserContext(), page = await context.newPage(), calls = []
        await page.setViewport({ width: 1440, height: 1000 })
        page.on('pageerror', error => errors.push(error.message))
        await page.evaluateOnNewDocument(() => {
          const original = window.fetch
          window.fetch = (url, init) => {
            if (String(url) === '/api/images' && init?.body instanceof FormData) {
              const form = init.body, headers = new Headers(init.headers)
              headers.set('x-prompt-intent-test', encodeURIComponent(JSON.stringify({ prompt: form.get('prompt'), promptMode: form.get('promptMode'), n: form.get('imageCount'), size: form.get('size'), model: form.get('model'), files: form.getAll('images').map(file => file.name), productCount: form.get('productImageCount') })))
              return original.call(window, url, { ...init, headers })
            }
            return original.call(window, url, init)
          }
        })
        await page.setRequestInterception(true)
        page.on('request', request => {
          const url = new URL(request.url())
          if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
          if (url.pathname === '/api/images') {
            calls.push(JSON.parse(decodeURIComponent(request.headers()['x-prompt-intent-test'])))
            return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: img }] }) })
          }
          if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
          void request.continue().catch(() => {})
        })
        await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
        await page.evaluate(({ route, source, model, img, scenes }) => {
          const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-intent-only', model }
          localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ image: connection, analysis: connection }))
          localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
          const entries = scenes.map((scene, i) => ({ id: 'intent-' + i, title: '测试版位' + i, enabled: true, size: '1:1', ratio: '1:1', quality: '2k', count: '1', customSize: '', references: [], extraNeeds: scene, prompt: i === 0 ? `【本次输出画布·最高优先级】最终成图必须使用2048x2048像素，保持商品完整。\n\n${scene}\n\n【最终画布尺寸】使用2048x2048。\n\n<!-- avw:image-model:v1 -->\n旧商品指令。\n<!-- /avw:image-model:v1 -->` : scene }))
          const key = route === '/' ? 'amazon-workbench.draft.workbench' : route === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.' + source
          localStorage.setItem(key, JSON.stringify({ generationMode: 'image', productImages: [{ id: 'p1', name: 'synthetic-product.png', dataUrl: img }, { id: 'p2', name: 'synthetic-detail.png', dataUrl: img }], ...(route === '/' ? { cards: entries } : { entries }) }))
        }, { route, source, model, img, scenes })
        await page.goto(BASE + route, { waitUntil: 'networkidle0' })
        await page.waitForFunction(() => [...document.querySelectorAll('[data-batch-generation] button')].some(el => !el.disabled && el.getBoundingClientRect().width > 0))
        await page.evaluate(() => [...document.querySelectorAll('[data-batch-generation] button')].find(el => !el.disabled && el.getBoundingClientRect().width > 0).click())
        await until(() => calls.length === 3, source + ' submits three')
        const queueKey = 'amazon-workbench.generateQueue.v2.' + source
        await until(() => page.evaluate(key => { const tasks = JSON.parse(localStorage.getItem(key) || '[]'); return tasks.length === 3 && tasks.every(task => task.status === 'success') }, queueKey), 'all received')
        for (const scene of scenes) {
          const trace = calls.find(call => call.prompt.includes(scene))
          assert.ok(trace, 'full user scenario retained')
          assert.equal(trace.n, '1'); assert.equal(trace.productCount, '2')
          assert.deepEqual(trace.files, ['synthetic-product.png', 'synthetic-detail.png'])
          if (route === '/simple') {
            const index = scenes.indexOf(scene)
            const input = index === 0 ? `【本次输出画布·最高优先级】最终成图必须使用2048x2048像素，保持商品完整。\n\n${scene}\n\n【最终画布尺寸】使用2048x2048。\n\n<!-- avw:image-model:v1 -->\n旧商品指令。\n<!-- /avw:image-model:v1 -->` : scene
            assert.equal(trace.prompt, input, 'simple must preserve even user-pasted legacy blocks without rewriting')
            assert.equal(trace.promptMode, 'verbatim')
            continue
          }
          assert.ok(!trace.prompt.includes('【本次输出画布') && !trace.prompt.includes('【最终画布尺寸】') && !trace.prompt.includes('旧商品指令'))
          assert.equal(trace.prompt.split('<!-- avw:canvas:v2 -->').length, 2)
          assert.equal(trace.prompt.split('<!-- avw:image-model:v2 -->').length, 2)
          assert.ok(trace.prompt.includes('本消息是绘图指令，不是要排印的文章'))
          assert.ok(trace.prompt.includes('无文字不等于无商品'))
          assert.ok(trace.prompt.includes('资料图不强制出镜'))
          assert.ok(trace.prompt.includes(model.startsWith('gemini') ? 'Native aspect ratio: 1:1' : 'Output size: 2048x2048 pixels'))
        }
        await page.screenshot({ path: OUT + '/' + source + '-' + model + '.png', fullPage: true })
        await page.reload({ waitUntil: 'networkidle0' })
        assert.equal(calls.length, 3, 'refresh must not repeat generation')
        await page.setViewport({ width: 390, height: 844 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no mobile horizontal overflow')
        if (route === '/simple') {
          await page.goto(BASE + '/simple', { waitUntil: 'networkidle0' })
          await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '文生图').click())
          await page.evaluate(() => [...document.querySelectorAll('[data-batch-generation] button')].find(el => !el.disabled && el.getBoundingClientRect().width > 0).click())
          await until(() => calls.length === 6, 'simple text mode sends three original prompts')
          await until(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').every(task => task.status === 'success'), queueKey), 'text results saved')
          for (let i = 0; i < 3; i++) {
            assert.equal(calls[3 + i].prompt, calls[i].prompt)
            assert.equal(calls[3 + i].promptMode, 'verbatim')
            assert.equal(calls[3 + i].productCount, '0')
            assert.deepEqual(calls[3 + i].files, [])
          }
          assert.ok(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).every(task => task.promptMode === 'verbatim'), queueKey), 'mode persists with queue for explicit retries/redraw')
          await page.reload({ waitUntil: 'networkidle0' })
          assert.equal(calls.length, 6, 'text mode refresh must not resend')
        }
        reports.push({ source, model, mockImageCalls: calls.length, fullBriefAndFiles: true, promptPolicy: route === '/simple' ? 'verbatim-image-and-text' : 'managed-canvas-and-model', noRefreshResend: true, noMobileOverflow: true })
        await context.close()
      }
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(OUT + '/results.json', JSON.stringify({ baseURL: BASE, reports, errors, mockImageCalls: reports.reduce((sum, report) => sum + report.mockImageCalls, 0), realPaidRequests: 0, limit: 'Request/UI verification only. Synthetic responses do not verify model output quality.' }, null, 2))
    console.log('PASS: 四入口×GPT/Gemini三类需求，含极简图文/文生图原文直传，共30次模拟；完整素材、模式持久化、刷新零重发与手机布局。非真实成图质量测试。')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
