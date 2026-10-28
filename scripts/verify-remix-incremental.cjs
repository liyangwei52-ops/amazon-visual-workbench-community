// Isolated Edge and synthetic same-category products only. All model requests mocked.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const out = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/remix-incremental-20261023/local')
const key = 'amazon-workbench.remixDraft'
const report = { base, checks: [], analysisCalls: 0, imageCalls: 0, paidCalls: 0, errors: [] }
const pass = message => { report.checks.push(message); console.log('PASS ' + message) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const prompt = (n, phase = '') => `【正向 Prompt】\nMIGRATED-SLOT-${n} ${phase}：蓝色花朵主题矩形沙滩垫，保留原图位和版式，平铺在浅色沙滩上。右侧人物穿蓝色休闲服装，柔和夕阳，文字区只写“Enjoy Your Beach Day”。尺寸未知，展示完整轮廓和表面印花，不画测量线。\n【负向 Prompt】\n不要旧海龟主题、旧尺寸数字、未知厚度、错误配件或额外文字。`
const output = (n, phase) => '【提示词 1】\n```text\n' + prompt(n, phase) + '\n```'
let browser, page
async function main() {
  fs.mkdirSync(out, { recursive: true })
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] })
  const context = await browser.createBrowserContext()
  page = await context.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  page.on('pageerror', error => report.errors.push(error.message))
  const calls = []
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
    if (url.pathname === '/api/analyze') { const body = JSON.parse(request.postData()); calls.push({ request, body, slot: Number(body.userText.match(/SLOT-(\d+)/)[1]) }); report.analysisCalls++; return }
    if (url.pathname === '/api/images') { report.imageCalls++; return void request.abort() }
    if (url.pathname.startsWith('/api/') || (!request.url().startsWith(base) && !request.url().startsWith('data:'))) return void request.abort()
    void request.continue().catch(() => {})
  })
  const until = async count => { const end = Date.now() + 15000; while (calls.length < count) { if (Date.now() > end) throw Error('Missing request ' + count); await delay(20) } }
  const respond = (call, data, status = 200) => call.request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
  const finish = (call, phase = '') => respond(call, { prompt: output(call.slot, phase) })
  const current = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
  const rewrite = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('[data-persistent-remix] button')].some(el => /^改写提示词 \d+ 条$/.test(el.textContent.trim()) && !el.disabled))
    await page.evaluate(() => { const button = [...document.querySelectorAll('[data-persistent-remix] button')].find(el => /^改写提示词 \d+ 条$/.test(el.textContent.trim())); button.click(); button.click() })
  }
  const idle = () => page.waitForFunction(() => !document.querySelector('[data-remix-status="running"]'))
  const image = 'data:image/png;base64,' + (await sharp({ create: { width: 96, height: 96, channels: 3, background: '#a8d5e6' } }).png().toBuffer()).toString('base64')
  await page.goto(base + '/settings', { waitUntil: 'networkidle0' })
  await page.evaluate(({ image, key }) => {
    const config = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-remix-incremental', model: 'mock-analysis' }
    localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: config, image: { ...config, model: 'gpt-image-2' } }))
    localStorage.setItem(key, JSON.stringify({ productInfo: '同类沙滩垫：旧海龟主题改为蓝色花朵主题，替换产品描述、人物服装及氛围；未提供实测尺寸。', productImages: [{ id: 'same-category', name: 'synthetic.png', dataUrl: image }], entries: Array.from({ length: 9 }, (_, i) => ({ id: 'slot-' + (i + 1), prompt: `SLOT-${i + 1}：旧海龟主题矩形沙滩垫，200x210cm，沙滩人物及尺寸版位；沿用图位。`, enabled: i < 8, size: '1:1', customSize: '', quality: '2k', count: '1' })) }))
  }, { image, key })
  await page.goto(base + '/remix', { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-persistent-remix] img[alt="新产品图"]')
  const original = await current()
  assert.equal(calls.length, 0)
  await rewrite(); await until(3)
  assert.equal(calls.length, 3)
  assert(calls.every(call => call.body.systemPrompt.startsWith('# 提示词迁移｜图位语义与产品映射师 v9')))
  assert(calls[0].body.systemPrompt.includes('默认任务：同类商品换主题'))
  assert(calls[0].body.systemPrompt.includes('不要因旧稿写过尺寸就将其升级为本次必填'))
  assert(calls[0].body.userText.includes('不把缺长宽厚当普通迁移的阻断条件'))
  assert(calls[0].body.images.length === 1)
  pass('v8完整角色及同类换主题/未知尺寸替代规则同步发送，恢复/双击不重复提交，最多三路')
  await finish(calls[2], 'first'); await until(4)
  assert((await current()).entries[2].prompt.includes(prompt(3, 'first')))
  assert.equal((await current()).entries[0].prompt, original.entries[0].prompt)
  assert(await page.$eval('[aria-label="提示词 3"]', el => el.value.includes('MIGRATED-SLOT-3') && !el.matches(':disabled')))
  assert(await page.$eval('[aria-label="提示词 1"]', el => el.matches(':disabled')))
  pass('第三条先返回立即按ID填入并落盘，其他请求仍在等待，已完成可编辑而待返回框防覆盖')
  await page.evaluate(() => [...document.querySelectorAll('a[href="/settings"]')].find(el => el.getBoundingClientRect().width).click())
  await page.waitForSelector('[data-remix-running-link]')
  await respond(calls[0], { prompt: '【无法完成】输入编号：1；缺少本次明确必须标注的实测尺寸，不允许无数值替代。' })
  await until(5); await finish(calls[1], 'first'); await until(6)
  await respond(calls[3], { error: '合成错误 MOCK-INCREMENTAL-500' }, 500)
  await until(7); await finish(calls[4], 'first'); await until(8)
  await Promise.all([finish(calls[7], 'first'), finish(calls[6], 'first'), finish(calls[5], 'first')])
  await idle()
  await page.evaluate(() => [...document.querySelectorAll('a[href="/remix"]')].find(el => el.getBoundingClientRect().width).click())
  await page.waitForFunction(() => location.pathname === '/remix')
  const partial = await current()
  for (let i = 0; i < 8; i++) assert.equal(partial.entries[i].prompt, [0, 3].includes(i) ? original.entries[i].prompt : partial.entries[i].prompt)
  for (const n of [2, 3, 5, 6, 7, 8]) assert(partial.entries[n - 1].prompt.includes(prompt(n, 'first')))
  assert.deepEqual(partial.entries[8], original.entries[8])
  assert.match(await page.$eval('[data-persistent-remix] [role="alert"]', el => el.textContent), /已填入 6\/8/)
  assert.equal(await page.$$eval('[data-remix-entry-error]', els => els.length), 2)
  assert.equal(calls.length, 8)
  pass('隐藏期间乱序返回6比8立即填好，失败1/4保留原文和各自原因，未启用第9条不变，零自动重试')
  await page.setViewport({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: path.join(out, 'partial-six-of-eight.png'), fullPage: true })
  await page.setViewport({ width: 1440, height: 1000 })
  await rewrite(); await until(10)
  assert.deepEqual(calls.slice(8).map(call => call.slot).sort((a, b) => a - b), [1, 4])
  await Promise.all(calls.slice(8).map(call => finish(call, 'retry')))
  await idle()
  const recovered = await current()
  for (const n of [2, 3, 5, 6, 7, 8]) assert.equal(recovered.entries[n - 1].prompt, partial.entries[n - 1].prompt)
  assert.match(await page.$eval('[data-remix-status="completed"]', el => el.textContent), /已更新 8\/8/)
  assert.equal(calls.length, 10)
  pass('手动继续仅发失败1/4两条，成功六条不重复请求也不改写，8比8完成')

  await rewrite(); await until(13)
  await respond(calls[10], { error: '合成失败 MOCK-EDIT' }, 500)
  for (let i = 11; i < 18; i++) { await until(i + 1); await finish(calls[i], 'second') }
  await idle()
  await page.$eval('[aria-label="提示词 3"]', el => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, el.value + '\nUSER-EDIT'); el.dispatchEvent(new Event('input', { bubbles: true })) })
  await rewrite(); await until(20)
  assert.deepEqual(calls.slice(18).map(call => call.slot).sort((a, b) => a - b), [1, 3])
  await Promise.all(calls.slice(18).map(call => finish(call, 'edited-retry'))); await idle()
  pass('部分完成后手改已返回第3条，只重发失败1和明确修改3，缓存不误吞人工修改')

  await rewrite(); await until(23)
  await finish(calls[22], 'checkpoint'); await until(24)
  const before = await current(), countBefore = calls.length
  assert(before.entries[2].prompt.includes('checkpoint'))
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-persistent-remix] img[alt="新产品图"]')
  assert.deepEqual((await current()).entries, before.entries)
  assert.equal(calls.length, countBefore)
  assert.equal(await page.$$eval('[data-remix-status="running"]', els => els.length), 0)
  pass('仅一条返回时快速刷新仍保留该检查点及其余原文，导航/恢复不分发、不重发模型')
  assert.equal(report.imageCalls, 0); assert.deepEqual(report.errors, [])
  pass('全程合成输入，模型端点全拦截，真实付费/生图/页面异常均0；模拟不代表真实模型质量')
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1 }).finally(async () => {
  if (report.failure && page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true })
  if (browser) await browser.close()
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  if (report.failure) console.error(report.failure)
})
