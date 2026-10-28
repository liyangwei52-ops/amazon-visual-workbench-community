// Synthetic fixtures only. All model endpoints are intercepted; no paid requests.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core')
const sharp = require('sharp')

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const out = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/planner-navigation-20261021/local')
const draftKey = 'amazon-workbench.draft.planner'
const report = { base, browser: 'isolated Microsoft Edge', checks: [], analysisCalls: 0, imageCalls: 0, errors: [], paidCalls: 0 }
const pass = text => { report.checks.push(text); console.log('PASS ' + text) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const prompt = n => `【正向 Prompt】\n第${n}幅合成示例：一支圆柱笔，银色笔夹连接笔帽。蓝色背景和中央浅色信息面板，左主物右细节。上图文字：无。\n【负向 Prompt】\n不增配件，不虚构实测数据。`
const responseText = [1, 2].map(n => `【提示词 ${n}｜版位${n}】\n【最终 AI 绘图 Prompt】\n` + '```text\n' + prompt(n) + '\n```').join('\n\n')
let browser
async function main() {
  fs.mkdirSync(out, { recursive: true })
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] })
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.evaluateOnNewDocument(() => {
    const original = AbortSignal.timeout.bind(AbortSignal)
    AbortSignal.timeout = ms => original(ms === 900000 && window.plannerTestShortTimeout ? 900 : ms)
  })
  const calls = []
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
    if (url.pathname === '/api/analyze') { calls.push({ request, body: JSON.parse(request.postData()) }); report.analysisCalls++; return }
    if (url.pathname === '/api/images') { report.imageCalls++; return void request.abort() }
    if (url.pathname.startsWith('/api/') || (!request.url().startsWith(base) && !request.url().startsWith('data:'))) return void request.abort()
    void request.continue().catch(() => {})
  })
  const untilCalls = async count => { const deadline = Date.now() + 15000; while (calls.length < count) { if (Date.now() > deadline) throw Error('Missing analysis request ' + count); await delay(25) } }
  const click = async label => {
    await page.waitForFunction(label => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === label && !el.disabled && el.getBoundingClientRect().width), {}, label)
    await page.evaluate(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label && el.getBoundingClientRect().width).click(), label)
  }
  const nav = async href => {
    await page.evaluate(href => { const link = [...document.querySelectorAll('a[href]')].find(el => el.getAttribute('href') === href && el.getBoundingClientRect().width); if (!link) throw Error('Missing visible link ' + href); link.click() }, href)
    await page.waitForFunction(href => location.pathname === href, {}, href)
  }
  const respond = (call, data, status = 200) => call.request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) })
  const current = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)
  const image = 'data:image/png;base64,' + (await sharp({ create: { width: 96, height: 96, channels: 3, background: '#c7dce2' } }).png().toBuffer()).toString('base64')
  await page.goto(base + '/settings', { waitUntil: 'networkidle0' })
  await page.evaluate(({ image, draftKey }) => {
    const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-planner-navigation', model: 'mock-analysis' }
    localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: connection, image: { ...connection, model: 'gpt-image-2' } }))
    const productImages = [{ id: 'synthetic-product', name: 'synthetic-product.png', dataUrl: image }]
    localStorage.setItem(draftKey, JSON.stringify({ productImages, productInfo: '合成示例，无实测尺寸。', planText: 'NAVIGATION-PLAN：只设计两张图。', entries: [{ id: 'original-slot', title: '旧版位', enabled: true, prompt: '旧提示词必须保留', size: '1:1', sizeUserSet: false, quality: '2k', count: '1', customSize: '' }] }))
    localStorage.setItem('amazon-workbench.draft.workbench', JSON.stringify({ productImages, cards: [{ id: 'concurrent-workbench', enabled: true, extraNeeds: 'NAVIGATION-WORKBENCH', prompt: '', references: [] }] }))
  }, { image, draftKey })
  await page.goto(base + '/planner', { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-persistent-planner] img[alt="产品图"]')
  assert.equal(await page.$$eval('[data-persistent-planner]', els => els.length), 1)
  assert.equal(calls.length, 0)
  pass('直接进入策划页只挂载一次，恢复草稿不请求模型')

  // Two synchronous clicks exercise the immediate duplicate-submit guard.
  await page.evaluate(() => {
    window.plannerNavigationToken = 'same-document'
    const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '开始策划' && el.getBoundingClientRect().width)
    button.click(); button.click()
  })
  await untilCalls(1)
  assert(calls[0].body.userText.includes('NAVIGATION-PLAN'))
  assert(calls[0].body.systemPrompt.startsWith('# 一键策划｜整套商品视觉内容策划师 v8'))
  await page.waitForFunction(() => /已等待 [1-9]/.test(document.querySelector('[data-persistent-planner] [data-request-wait]')?.textContent))
  const beforeWait = await page.$eval('[data-persistent-planner] [data-request-wait]', el => Number(el.textContent.match(/已等待 (\d+)/)[1]))
  await nav('/settings')
  await page.waitForSelector('[data-planner-running-link]')
  assert.equal(await page.$$eval('[data-fixed-actions]', els => els.filter(el => el.getBoundingClientRect().width).length), 0)
  await nav('/planner')
  assert.equal(await page.evaluate(() => window.plannerNavigationToken), 'same-document')
  assert.equal(await page.$eval('[data-persistent-planner] [data-request-wait]', el => Number(el.textContent.match(/已等待 (\d+)/)[1])) >= beforeWait, true)
  assert(await page.$$eval('[data-persistent-planner] button', els => els.some(el => el.textContent.trim() === '策划分析中…' && el.disabled)))
  assert.equal(calls.length, 1)
  pass('切走显示策划进行中提示；返回保留等待时间和禁用按钮，连续点击/导航不重复提交')
  await page.screenshot({ path: path.join(out, 'planner-running-after-return.png'), fullPage: true })

  await nav('/')
  await page.waitForSelector('[data-request-card="concurrent-workbench"]')
  const selected = await page.$eval('[aria-label="选择请求 1"]', el => el.checked)
  if (!selected) await page.click('[aria-label="选择请求 1"]')
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => /^生成提示词 \d+ 条$/.test(el.textContent.trim()) && el.getBoundingClientRect().width).click())
  await untilCalls(2)
  await nav('/settings')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-running-notice]')].some(el => el.textContent.includes('提示词分析 1 路') && el.textContent.includes('一键策划进行中')))
  await respond(calls[1], { prompt: prompt(3) })
  await page.waitForFunction(() => document.querySelector('[data-planner-running-link]') && ![...document.querySelectorAll('[data-running-notice]')].some(el => el.textContent.includes('提示词分析 1 路')))
  assert.equal(calls.length, 2)
  pass('工作台分析与策划同时运行，任一完成不清除另一请求状态')
  await page.screenshot({ path: path.join(out, 'planner-running-on-settings.png'), fullPage: true })
  await respond(calls[0], { prompt: responseText })
  await page.waitForFunction(key => { const draft = JSON.parse(localStorage.getItem(key)); return draft?.entries.length === 2 && draft.entries[1].prompt.includes('第2幅'); }, {}, draftKey)
  await page.waitForFunction(() => !document.querySelector('[data-planner-running-link]'))
  await nav('/planner')
  assert.match(await page.$eval('[data-planner-status="completed"]', el => el.textContent), /已填入 2 条/)
  assert.equal(await page.$$eval('[data-persistent-planner] [data-request-wait]', els => els.length), 0)
  const success = await current()
  assert.deepEqual(success.entries.map(entry => entry.prompt), [prompt(1), prompt(2)])
  assert.equal(success.planText, 'NAVIGATION-PLAN：只设计两张图。')
  assert.equal(success.productImages.length, 1)
  assert.equal(success.planResponse, responseText)
  assert.equal(calls.length, 2)
  pass('切走期间完成仍保存完整返回并自动填两框，返回显示完成条数且保留输入素材')

  await click('开始策划')
  await untilCalls(3)
  await nav('/settings')
  await respond(calls[2], { error: '合成失败：服务商错误，请求编号 MOCK-NAV-503' }, 503)
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.planError?.includes('MOCK-NAV-503'), {}, draftKey)
  await nav('/planner')
  assert.match(await page.$eval('[data-persistent-planner] [role="alert"]', el => el.textContent), /MOCK-NAV-503/)
  assert.deepEqual((await current()).entries, success.entries)
  assert.equal(calls.length, 3)
  pass('切走期间失败，返回保留错误/请求编号与旧提示词，不自动重试')

  await page.evaluate(() => { window.plannerTestShortTimeout = true })
  await click('开始策划')
  await untilCalls(4)
  await nav('/settings')
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.planError?.includes('超过15分钟'), {}, draftKey)
  await nav('/planner')
  assert.match(await page.$eval('[data-persistent-planner] [role="alert"]', el => el.textContent), /结果尚未确认.*不会自动重发/)
  assert.deepEqual((await current()).entries, success.entries)
  assert.equal(calls.length, 4)
  pass('受控缩短浏览器15分钟计时验证超时终止等待，保留结果不明与旧提示词，不重发')
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-persistent-planner] [role="alert"]')
  assert.equal(calls.length, 4)
  assert.equal(await page.$$eval('[data-persistent-planner]', els => els.length), 1)
  assert.equal(await page.$$eval('[data-planner-status="running"]', els => els.length), 0)
  assert.deepEqual((await current()).entries, success.entries)
  pass('刷新只恢复草稿/错误，不声称旧连接仍活跃，不自动分析或生图')
  await page.setViewport({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.equal(await page.$$eval('[data-fixed-actions]', els => els.filter(el => el.getBoundingClientRect().width).length), 1)
  await page.screenshot({ path: path.join(out, 'planner-mobile-timeout.png'), fullPage: true })
  pass('手机无横向溢出，常驻隐藏页不叠加固定操作栏')
  assert.equal(report.imageCalls, 0)
  assert.deepEqual(report.errors, [])
  pass('共4次分析拦截模拟，真实付费/生图请求/页面异常均为0')
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1 }).finally(async () => { if (browser) await browser.close(); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); if (report.failure) console.error(report.failure) })
