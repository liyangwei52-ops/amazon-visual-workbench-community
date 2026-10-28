const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), puppeteer = require('puppeteer-core'), sharp = require('sharp')
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3013', OUT = path.resolve('verification/workbench-selection')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test) { const end = Date.now() + 15000; while (!test()) { if (Date.now() > end) throw new Error('Request count timeout'); await delay(25) } }
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const fixture = 'data:image/png;base64,' + (await sharp({ create: { width: 128, height: 128, channels: 3, background: '#aabcdd' } }).png().toBuffer()).toString('base64')
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] })
  try {
    const context = await browser.createBrowserContext(), page = await context.newPage(), analyses = [], images = [], errors = []
    page.on('pageerror', error => errors.push(error.message)); await page.setViewport({ width: 1440, height: 1100 }); await page.setRequestInterception(true)
    page.on('request', request => {
      const route = new URL(request.url()).pathname
      if (route === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
      if (route === '/api/analyze') { analyses.push({ request, body: JSON.parse(request.postData()), replied: false }); return }
      if (route === '/api/images') { images.push(request); return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ src: fixture }] }) }) }
      if (request.url().startsWith('https://api.openlux.ai/')) throw new Error('Test must never contact provider')
      void request.continue()
    })
    const click = text => page.evaluate(text => { const button = [...document.querySelectorAll('button')].find(x => (x.textContent.trim() === text || (text === '生成提示词' && /^生成提示词 \d+ 条$/.test(x.textContent.trim())))); assertButton(button); button.click(); function assertButton(button) { if (!button || button.disabled) throw new Error('Button unavailable: ' + text) } }, text)
    const checked = () => page.$$eval('input[aria-label^="选择请求"]', elements => elements.map(x => x.checked))
    const values = () => page.$$eval('[data-request-card] textarea[placeholder="填写或粘贴完整提示词…"]', elements => elements.map(x => x.value))
    const reply = async (item, prompt, status = 200) => { item.replied = true; await item.request.respond({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { prompt } : { error: '模拟分析失败，保留原提示词' }) }) }
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
    await page.evaluate(fixture => {
      const config = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-selection-only', model: 'mock-analysis' }
      localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: config, image: { ...config, model: 'gpt-image-2' } }))
      localStorage.setItem('amazon-workbench.profile.v1', JSON.stringify({ autoArchive: false }))
      localStorage.setItem('amazon-workbench.draft.workbench', JSON.stringify({ productImages: [{ id: 'product', name: 'selection.png', dataUrl: fixture }], cards: [1, 2, 3].map(index => ({ id: 'selection-' + index, enabled: index !== 2, extraNeeds: 'SELECTION_' + index, references: [], prompt: '原提示词_' + index, size: '1024x1024', count: String(index === 1 ? 4 : index === 3 ? 2 : 1) })) }))
    }, fixture)
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' }); await page.waitForSelector('img[alt="我方产品图"]'); await page.waitForFunction(() => document.querySelectorAll('[data-request-card]').length === 3)
    assert.deepEqual(await checked(), [true, false, true], '已保存的启用和关闭选择保留')
    const actionOrder = await page.$$eval('button', elements => elements.map(x => x.textContent.trim().replace(/^生成 \d+ 条$/, '生成条数').replace(/^生成提示词 \d+ 条$/, '生成提示词')).filter(x => ['新增请求', '生成条数', '生成提示词'].includes(x)))
    assert.deepEqual(actionOrder, ['新增请求', '生成条数', '生成提示词'], '批量按钮按指定顺序出现，卡片不重复放按钮')
    await page.click('[aria-label="选择请求 1"]'); await page.click('[aria-label="选择请求 3"]'); await delay(150)
    assert.equal(analyses.length, 0); assert.equal(images.length, 0)
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.closest('[data-batch-generation]') || /^生成提示词 \d+ 条$/.test(x.textContent.trim())).every(x => x.disabled)))
    assert.ok(await page.$$eval('[data-request-card]', cards => cards.every(card => [...card.querySelectorAll('button')].find(x => x.textContent.trim() === '② 生图').disabled)))
    await delay(700); await page.reload({ waitUntil: 'networkidle0' }); assert.deepEqual(await checked(), [false, false, false])
    await page.click('[aria-label="选择请求 3"]'); await click('生成提示词'); await until(() => analyses.length === 1)
    assert.ok(analyses[0].body.userText.includes('SELECTION_3')); assert.ok(await page.$eval('[aria-label="选择请求 3"]', x => x.disabled))
    const final3 = '【正向 Prompt】第三路完整提示词。' + '保留商品细节、构图和光线。'.repeat(90) + '\n【负向 Prompt】禁止变形。'
    await reply(analyses[0], final3); await page.waitForFunction(() => !document.querySelector('[aria-label="选择请求 3"]').disabled)
    const saved1 = await values(); assert.equal(saved1[0], '原提示词_1'); assert.equal(saved1[1], '原提示词_2'); assert.ok(saved1[2].includes('第三路完整提示词'))
    await page.click('[aria-label="选择请求 1"]'); await click('生成提示词'); await until(() => analyses.length === 3)
    assert.deepEqual(analyses.slice(1).map(x => /SELECTION_(\d)/.exec(x.body.userText)[1]).sort(), ['1', '3'])
    await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('生成提示词中')).click()); await delay(100); assert.equal(analyses.length, 3, '忙碌中不重复提交')
    await reply(analyses.slice(1).find(x => x.body.userText.includes('SELECTION_3')), '', 500); await reply(analyses.slice(1).find(x => x.body.userText.includes('SELECTION_1')), '【正向 Prompt】第一路新提示词\n【负向 Prompt】禁止变形')
    await page.waitForFunction(() => !document.querySelector('[aria-label="选择请求 1"]').disabled)
    const saved2 = await values(); assert.ok(saved2[0].includes('第一路新提示词')); assert.equal(saved2[1], '原提示词_2'); assert.equal(saved2[2], saved1[2], '失败不清空已有提示词')
    await page.screenshot({ path: OUT + '/desktop.png', fullPage: true })
    for (const width of [390, 320]) { await page.setViewport({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '手机无横向溢出'); await page.screenshot({ path: `${OUT}/mobile-${width}.png`, fullPage: true }) }
    await page.setViewport({ width: 1440, height: 1100 }); await delay(700); await page.reload({ waitUntil: 'networkidle0' }); assert.deepEqual(await checked(), [true, false, true]); assert.equal(analyses.length, 3, '刷新不能自动分析')
    await click('生成 2 条'); await page.waitForFunction(() => location.pathname === '/generate'); await until(() => images.length === 2)
    const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')))
    assert.deepEqual(queue.map(x => x.id), ['selection-1', 'selection-3']); assert.deepEqual(queue.map(x => x.count), [4, 2]); assert.equal(analyses.length, 3); assert.deepEqual(errors, [])
    fs.writeFileSync(OUT + '/result.json', JSON.stringify({ baseURL: BASE, selectedAnalysisOnly: true, unselectedContentPreserved: true, stateRestored: true, allUncheckedCalls: 0, analyses: 3, imageTasks: queue.map(({ id, count }) => ({ id, count })), failureKeepsPrompt: true, duplicateSubmissions: 0, mobileWidths: [390, 320], paidCalls: 0 }, null, 2))
    console.log('PASS: 勾选与草稿恢复；只分析选中卡片；批量并行；失败保留原文；未勾选不发请求；只提交选中生图；按钮顺序；手机布局；模拟零费用')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
