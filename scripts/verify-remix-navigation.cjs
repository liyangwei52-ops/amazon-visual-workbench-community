// Synthetic inputs only. Every model endpoint is intercepted; no paid requests.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core')
const sharp = require('sharp')

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const out = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/remix-navigation-20261022/local')
const key = 'amazon-workbench.remixDraft'
const report = { base, browser: 'isolated Microsoft Edge', checks: [], analysisCalls: 0, imageCalls: 0, errors: [], paidCalls: 0 }
const pass = message => { report.checks.push(message); console.log('PASS ' + message) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const prompt = (n, phase = '') => `【正向 Prompt】\nRETURN-${n} ${phase}：一支圆柱笔，银色笔夹连接笔帽。蓝色背景，左侧主体，右侧细节。上图文字：无。\n【负向 Prompt】\n不增配件，不虚构实测尺寸。`
const output = (n, phase) => `【提示词 1】\n【最终 AI 绘图 Prompt】\n` + '```text\n' + prompt(n, phase) + '\n```'
let browser, page
async function main() {
  fs.mkdirSync(out, { recursive: true })
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] })
  const context = await browser.createBrowserContext()
  page = await context.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.evaluateOnNewDocument(() => {
    const original = AbortSignal.timeout.bind(AbortSignal)
    AbortSignal.timeout = ms => original(ms === 900000 && window.remixTestShortTimeout ? 1200 : ms)
  })
  const calls = [], planners = []
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
    if (url.pathname === '/api/analyze') {
      const body = JSON.parse(request.postData())
      ;(body.userText.includes('【本批迁移') ? calls : planners).push({ request, body })
      report.analysisCalls++
      return
    }
    if (url.pathname === '/api/images') { report.imageCalls++; return void request.abort() }
    if (url.pathname.startsWith('/api/') || (!request.url().startsWith(base) && !request.url().startsWith('data:'))) return void request.abort()
    void request.continue().catch(() => {})
  })
  const until = async (list, count) => {
    const end = Date.now() + 15000
    while (list.length < count) { if (Date.now() > end) throw Error('Missing intercepted request ' + count); await delay(25) }
  }
  const respond = (call, data, status = 200) => call.request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
  const finish = (call, phase) => {
    const n = Number(call.body.userText.match(/(?:ENTRY|RETURN)-(\d+)/)[1])
    return respond(call, { prompt: output(n, phase) })
  }
  const nav = async href => {
    await page.evaluate(href => {
      const link = [...document.querySelectorAll('a[href]')].find(el => new URL(el.href).pathname === href && el.getBoundingClientRect().width)
      if (!link) throw Error('Missing visible link ' + href)
      link.click()
    }, href)
    await page.waitForFunction(href => location.pathname === href, {}, href)
  }
  const rewrite = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('[data-persistent-remix] button')].some(el => /^改写提示词 \d+ 条$/.test(el.textContent.trim()) && !el.disabled && el.getBoundingClientRect().width))
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('[data-persistent-remix] button')].find(el => /^改写提示词 \d+ 条$/.test(el.textContent.trim()))
      button.click(); button.click()
    })
  }
  const current = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
  const image = 'data:image/png;base64,' + (await sharp({ create: { width: 96, height: 96, channels: 3, background: '#c7dce2' } }).png().toBuffer()).toString('base64')
  await page.goto(base + '/settings', { waitUntil: 'networkidle0' })
  await page.evaluate(({ key, image }) => {
    const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-remix-navigation', model: 'mock-analysis' }
    localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: connection, image: { ...connection, model: 'gpt-image-2' } }))
    const productImages = [{ id: 'synthetic-product', name: 'synthetic-product.png', dataUrl: image }]
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: 'entry-' + (i + 1), prompt: 'ENTRY-' + (i + 1) + ' 原提示词必须保留', enabled: i < 5, size: '1:1', customSize: '', quality: '2k', count: i === 1 ? '2' : '1' }))
    localStorage.setItem(key, JSON.stringify({ productImages, productInfo: '合成商品信息，无实测尺寸。', entries }))
    localStorage.setItem('amazon-workbench.draft.planner', JSON.stringify({ productImages, productInfo: '合成商品', planText: '只设计1张', entries: [{ id: 'planner-old', title: '旧版位', prompt: '旧策划', enabled: true, size: '1:1', quality: '2k', count: '1', customSize: '' }] }))
    localStorage.setItem('amazon-workbench.suites', JSON.stringify([{ id: 'nav-suite', name: '合成导航套装', savedAt: 1, entries: [{ id: 'suite-slot', prompt: 'SUITE-CONTENT', size: '4:3', customSize: '' }] }]))
  }, { key, image })
  await page.goto(base + '/remix', { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-persistent-remix] img[alt="新产品图"]')
  assert.equal(await page.$$eval('[data-persistent-remix]', els => els.length), 1)
  assert.equal(calls.length, 0)
  const original = await current()
  pass('直接进入迁移页仅挂载一次，恢复六个框/素材/启用参数，不请求模型')

  await page.evaluate(() => { window.remixNavigationToken = 'same-document' })
  await rewrite()
  await until(calls, 3)
  await page.waitForFunction(() => /已等待 [1-9]/.test(document.querySelector('[data-persistent-remix] [data-request-wait]')?.textContent))
  const before = await page.$eval('[data-persistent-remix] [data-request-wait]', el => Number(el.textContent.match(/已等待 (\d+)/)[1]))
  assert.equal(calls.length, 3)
  assert(calls.every(call => call.body.images.length === 1 && call.body.userText.includes('合成商品信息')))
  assert(await page.$eval('[aria-label="启用第 6 条"]', el => !el.checked && !el.disabled))
  await nav('/settings')
  await page.waitForSelector('[data-remix-running-link]')
  assert.equal(await page.$$eval('[data-fixed-actions]', els => els.filter(el => el.getBoundingClientRect().width).length), 0)
  await finish(calls[0], 'first')
  await until(calls, 4)
  await nav('/remix')
  assert.equal(await page.evaluate(() => window.remixNavigationToken), 'same-document')
  assert(await page.$eval('[data-persistent-remix] [data-request-wait]', el => Number(el.textContent.match(/已等待 (\d+)/)[1])) >= before)
  assert.match(await page.$eval('[data-remix-status="running"]', el => el.textContent), /已填入 1\/5 条/)
  assert(await page.$$eval('[data-persistent-remix] button', els => els.some(el => el.textContent.includes('AI 改写中') && el.disabled)))
  assert.equal(calls.length, 4)
  await nav('/suite')
  await page.waitForFunction(() => [...document.querySelectorAll('a')].some(el => el.textContent.includes('在提示词迁移使用') && el.getBoundingClientRect().width))
  await page.evaluate(() => [...document.querySelectorAll('a')].find(el => el.textContent.includes('在提示词迁移使用') && el.getBoundingClientRect().width).click())
  await page.waitForFunction(() => location.pathname === '/remix')
  assert(await page.$$eval('[data-persistent-remix] textarea', els => els.some(el => el.value.includes('RETURN-1')) && !els.some(el => el.value === 'SUITE-CONTENT')))
  assert.equal(await page.evaluate(() => localStorage.getItem('amazon-workbench.loadSuiteId')), null)
  assert.equal(calls.length, 4)
  pass('同步双击不重复提交；切走继续接收，返回保留计时/1比5进度/忙碌按钮，套装载入不能覆盖进行中条目')
  await page.screenshot({ path: path.join(out, 'remix-running-after-return.png'), fullPage: true })

  await nav('/planner')
  await page.waitForSelector('[data-persistent-planner] img[alt="产品图"]')
  await page.evaluate(() => [...document.querySelectorAll('[data-persistent-planner] button')].find(el => el.textContent.trim() === '开始策划').click())
  await until(planners, 1)
  await nav('/settings')
  await page.waitForFunction(() => document.querySelector('[data-remix-running-link]') && document.querySelector('[data-planner-running-link]'))
  await respond(planners[0], { prompt: output(99, 'planner') })
  await page.waitForFunction(() => document.querySelector('[data-remix-running-link]') && !document.querySelector('[data-planner-running-link]'))
  pass('迁移与策划同时等待，策划完成不清除迁移状态')
  for (let i = 1; i < 5; i++) { await until(calls, i + 1); await finish(calls[i], 'first') }
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.entries[4].prompt.includes('RETURN-5'), {}, key)
  await page.waitForFunction(() => !document.querySelector('[data-remix-running-link]'))
  await nav('/remix')
  assert.match(await page.$eval('[data-remix-status="completed"]', el => el.textContent), /已更新 5\/5 条/)
  const success = await current()
  for (let i = 0; i < 5; i++) assert(success.entries[i].prompt.includes(prompt(i + 1, 'first')))
  assert.deepEqual(success.entries[5], original.entries[5])
  assert.deepEqual(success.entries.map(e => [e.id, e.enabled, e.size, e.quality, e.count]), original.entries.map(e => [e.id, e.enabled, e.size, e.quality, e.count]))
  assert.deepEqual(success.productImages, original.productImages)
  pass('隐藏期间五条完整回填并保存，返回显示完成数，未启用框/ID/顺序/参数/素材保留且无生成图预览')
  assert.equal(await page.$$eval('[data-persistent-remix] [data-request-wait]', els => els.length), 0)
  assert.equal(await page.$$eval('[data-persistent-remix] main img', els => els.filter(el => el.alt !== '新产品图').length), 0)

  await rewrite()
  await until(calls, 8)
  await nav('/settings')
  await respond(calls[5], { error: '合成服务商错误，请求编号 MOCK-REMIX-503' }, 503)
  for (let i = 6; i < 10; i++) { await until(calls, i + 1); await finish(calls[i], 'cached') }
  await page.waitForFunction(() => !document.querySelector('[data-remix-running-link]'))
  await nav('/remix')
  assert.match(await page.$eval('[data-persistent-remix] [role="alert"]', el => el.textContent), /MOCK-REMIX-503/)
  const partial = (await current()).entries; assert.equal(partial[0].prompt, success.entries[0].prompt); for (let i = 1; i < 5; i++) assert(partial[i].prompt.includes(prompt(i + 1, 'cached')))
  assert.equal(calls.length, 10)
  pass('隐藏期间部分失败，成功四条直接填入/失败项保留原文与编号，无自动重发')
  await nav('/settings'); await nav('/remix')
  assert.equal(calls.length, 10)
  await rewrite()
  await until(calls, 11)
  await finish(calls[10], 'cached')
  await page.waitForSelector('[data-remix-status="completed"]')
  assert.equal(calls.length, 11)
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.entries[0].prompt.includes('cached'), {}, key)
  pass('仅手动点击继续改写，复用本会话已完成缓存，只请求缺少的一条')

  await page.evaluate(() => { window.remixTestShortTimeout = true })
  await rewrite()
  await until(calls, 14)
  await nav('/settings')
  await page.waitForFunction(() => !document.querySelector('[data-remix-running-link]'))
  await nav('/remix')
  assert.match(await page.$eval('[data-persistent-remix] [role="alert"]', el => el.textContent), /超过15分钟.*结果尚未确认/s)
  assert.equal(calls.length, 16)
  const beforeReload = await current()
  pass('受控缩短15分钟计时后显示超时结果不明，保留原文，不自动重试')
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-persistent-remix] img[alt="新产品图"]')
  assert.equal(calls.length, 16)
  assert.equal(await page.$$eval('[data-remix-status]', els => els.length), 0)
  assert.deepEqual((await current()).entries, beforeReload.entries)
  pass('刷新只恢复草稿，不恢复运行资格/缓存/错误，不重复请求或声称接回旧连接')

  await nav('/suite')
  await page.waitForFunction(() => [...document.querySelectorAll('a')].some(el => el.textContent.includes('在提示词迁移使用') && el.getBoundingClientRect().width))
  await page.evaluate(() => [...document.querySelectorAll('a')].find(el => el.textContent.includes('在提示词迁移使用') && el.getBoundingClientRect().width).click())
  await page.waitForFunction(() => location.pathname === '/remix' && [...document.querySelectorAll('[data-persistent-remix] textarea')].some(el => el.value === 'SUITE-CONTENT'))
  assert.equal(await page.$$eval('[data-persistent-remix]', els => els.length), 1)
  assert.equal(calls.length, 16)
  pass('已有常驻迁移页仍响应套装页显式载入，保留产品，载入本身零模型请求')
  await page.setViewport({ width: 390, height: 844 })
  await delay(250)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.equal(await page.$$eval('[data-fixed-actions]', els => els.filter(el => el.getBoundingClientRect().width).length), 1)
  await page.screenshot({ path: path.join(out, 'remix-mobile-suite.png'), fullPage: true })
  pass('390px手机无横向溢出，隐藏页不叠加固定操作栏')
  assert.equal(report.imageCalls, 0)
  assert.deepEqual(report.errors, [])
  pass('全部模型端点拦截，真实付费请求/生图请求/页面异常均为0')
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1 }).finally(async () => {
  if (report.failure && page) {
    fs.writeFileSync(path.join(out, 'failure-state.json'), JSON.stringify(await page.evaluate(key => ({ url: location.href, html: document.body.innerHTML, draft: localStorage.getItem(key) }), key), null, 2))
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true })
  }
  if (browser) await browser.close()
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  if (report.failure) console.error(report.failure)
})
