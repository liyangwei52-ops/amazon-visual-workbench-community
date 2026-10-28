// Synthetic suites and isolated Edge profile only; all model endpoints blocked.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core')
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const out = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/suite-return-20261023/local')
const key = 'amazon-workbench.draft.suite'
const report = { base, checks: [], modelCalls: 0, errors: [], paidCalls: 0 }
const pass = message => { report.checks.push(message); console.log('PASS ' + message) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const entries = Array.from({ length: 8 }, (_, i) => ({ id: 'suite-slot-' + i, size: i === 1 || i === 2 ? 'custom' : '1:1', customSize: i === 1 ? '1440x960' : i === 2 ? '5:4' : '', prompt: `【正向 Prompt】\nENTRY-${i + 1}\n` + '完整合成画面与非中文文案，不是实测商品信息。'.repeat(60) + '\n【负向 Prompt】\n不虚构实测数据。' }))
let browser, page
async function main() {
  fs.mkdirSync(out, { recursive: true })
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] })
  const context = await browser.createBrowserContext()
  page = await context.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  page.on('pageerror', e => report.errors.push(e.message))
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = new URL(request.url())
    if (/\/api\/(analyze|images|provider-transport)/.test(url.pathname)) { report.modelCalls++; return void request.abort() }
    if (url.pathname.startsWith('/api/') || (!request.url().startsWith(base) && !request.url().startsWith('data:'))) return void request.abort()
    void request.continue().catch(() => {})
  })
  const click = async text => {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === text && !el.disabled && el.getBoundingClientRect().width), {}, text)
    await page.evaluate(text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text && el.getBoundingClientRect().width).click(), text)
  }
  const setValue = async (selector, value) => {
    await page.$eval(selector, (el, value) => {
      Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }
  const navSuite = async (source, manage = false) => {
    await page.evaluate(manage => {
      const link = [...document.querySelectorAll('a')].find(el => el.getBoundingClientRect().width && (manage ? el.textContent.trim() === '管理套装' : el.dataset.navKey === 'suite'))
      if (!link) throw Error('Missing suite entry')
      link.click()
    }, manage)
    await page.waitForSelector('#suite-name')
    assert.equal(await page.evaluate(() => new URL(location.href).searchParams.get('returnTo')), source)
    await page.waitForFunction(() => document.querySelectorAll('[data-suite-list-return]').length >= 1)
    assert.equal(await page.$$eval('main:has(#suite-name) a', els => els.some(el => el.textContent.includes('返回视觉工作台'))), false)
  }
  const read = storageKey => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), storageKey)
  await page.goto(base + '/settings', { waitUntil: 'networkidle0' })
  await page.evaluate(({ key, entries }) => {
    localStorage.setItem(key, JSON.stringify({ name: '八条合成套装', entries }))
    localStorage.setItem('amazon-workbench.remixDraft', JSON.stringify({ productInfo: 'ORIGINAL-PRODUCT-INFO', entries: [{ id: 'original-entry', prompt: 'ORIGINAL-REMIX-TEXT', enabled: false, size: '4:3', customSize: '', quality: '1k', count: '2' }] }))
    localStorage.setItem('amazon-workbench.draft.simple', JSON.stringify({ entries: [{ id: 'original-simple', prompt: 'ORIGINAL-SIMPLE-TEXT', enabled: true, ratio: '1:1', customSize: '', quality: '2k', count: '1' }] }))
  }, { key, entries })
  await page.goto(base + '/remix', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some(el => el.value === 'ORIGINAL-REMIX-TEXT'))
  const remixBefore = await read('amazon-workbench.remixDraft')
  await navSuite('/remix', true)
  await page.waitForFunction(() => document.querySelector('#suite-name').value === '八条合成套装')
  assert.equal(await page.$$eval('main:has(#suite-name) [data-prompt-preview]', els => els.length), 8)
  pass('从迁移管理套装进入，八条草稿完整恢复，保存返回操作指向套装列表')
  const edited = entries[0].prompt + '\nEDIT-SAVED'
  await setValue('main:has(#suite-name) [data-prompt-preview]', edited)
  await click('仅保存')
  assert.equal(new URL(page.url()).pathname, '/suite')
  const saved = await read('amazon-workbench.suites')
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0].entries.map(e => e.prompt), [edited, ...entries.slice(1).map(e => e.prompt)])
  assert.deepEqual(saved[0].entries.map(e => [e.size, e.customSize]), entries.map(e => [e.size, e.customSize]))
  assert.deepEqual(Object.keys(saved[0]).sort(), ['entries', 'id', 'name', 'savedAt'])
  await page.screenshot({ path: path.join(out, 'suite-desktop.png'), fullPage: false })
  pass('仅保存留在编辑页，八条长文/顺序/新自定义比例/旧像素完整保留，无额外素材或配置字段')
  await click('保存并返回套装列表')
  await page.waitForFunction(() => document.querySelector('#suite-name').value === '' && document.querySelectorAll('main:has(#suite-name) [data-prompt-preview]').length === 1)
  assert.equal(new URL(page.url()).pathname, '/suite')
  assert.equal((await read(key)).name, '')
  assert.equal((await read(key)).entries.length, 1)
  assert.equal((await read(key)).entries[0].prompt, '')
  assert.equal(await page.$$eval('main:has(#suite-name) [data-prompt-preview]', els => els.length), 1)
  assert.equal((await read('amazon-workbench.suites'))[0].id, saved[0].id)
  assert.deepEqual((await read('amazon-workbench.remixDraft')).entries, remixBefore.entries)
  assert.equal((await read('amazon-workbench.remixDraft')).productInfo, remixBefore.productInfo)
  await page.screenshot({ path: path.join(out, 'suite-list-after-save.png'), fullPage: true })
  pass('同名保存成功后留在图二的套装列表/空白表单，不新建重复套装或覆盖迁移输入')
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('#suite-name')
  assert.equal(await page.$eval('#suite-name', el => el.value), '')
  assert.equal(await page.$$eval('main:has(#suite-name) [data-prompt-preview]', els => els.length), 1)
  assert.equal((await read('amazon-workbench.suites'))[0].entries.length, 8)
  pass('保存后立即刷新仍停在套装列表和空白表单，已保存八条保持完整')

  // The same shared sidebar must preserve both input and result destinations.
  for (const source of ['/simple', '/planner', '/', '/generate?source=remix']) {
    await page.goto(base + source, { waitUntil: 'networkidle0' })
    await navSuite(source, source === '/simple')
    await click('载入编辑')
    await page.waitForFunction(() => document.querySelector('#suite-name').value === '八条合成套装')
    await click('保存并返回套装列表')
    await page.waitForFunction(() => document.querySelector('#suite-name').value === '')
    assert.equal(new URL(page.url()).pathname, '/suite')
  }
  pass('极简、策划、工作台和结果侧栏进入后，保存均回套装列表及空白表单')

  await page.goto(base + '/remix', { waitUntil: 'networkidle0' })
  await navSuite('/remix', true)
  await click('载入编辑')
  const topEdited = edited + '\nTOP-SAVED'
  await setValue('main:has(#suite-name) [data-prompt-preview]', topEdited)
  await page.evaluate(() => document.querySelector('[data-suite-list-return]').click())
  await page.waitForFunction(() => document.querySelector('#suite-name').value === '')
  assert.equal((await read('amazon-workbench.suites'))[0].entries[0].prompt, topEdited)
  pass('顶部操作保存当前编辑后回套装列表，完整正文写入同名套装')

  await setValue('#suite-name', '')
  await click('保存并返回套装列表')
  await page.waitForSelector('[data-suite-save-error]')
  assert.match(await page.$eval('[data-suite-save-error]', el => el.textContent), /套装名称/)
  assert.equal(new URL(page.url()).pathname, '/suite')
  await click('载入编辑')
  await setValue('#suite-name', '保存失败合成示例')
  await setValue('[aria-label="提示词 3 的自定义比例"]', 'invalid')
  await click('保存并返回套装列表')
  assert.match(await page.$eval('[data-suite-save-error]', el => el.textContent), /自定义比例/)
  await setValue('[aria-label="提示词 3 的自定义比例"]', '5:4')
  await page.evaluate(() => {
    window.originalSuiteSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 'amazon-workbench.suites') throw new DOMException('Synthetic storage full', 'QuotaExceededError')
      return window.originalSuiteSetItem.call(this, key, value)
    }
  })
  await click('保存并返回套装列表')
  assert.match(await page.$eval('[data-suite-save-error]', el => el.textContent), /保存失败/)
  assert.equal(new URL(page.url()).pathname, '/suite')
  assert.equal(await page.$$eval('main:has(#suite-name) [data-prompt-preview]', els => els.length), 8)
  assert.equal((await read('amazon-workbench.suites'))[0].name, '八条合成套装')
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSuiteSetItem })
  pass('空名称/无效比例/存储失败均留在编辑页并持续显示原因，保留八条输入和原套装')

  for (const returnTo of ['https://example.com', '//example.com', 'javascript:alert(1)', '/suite', null]) {
    await page.goto(base + '/suite' + (returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : ''), { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-suite-list-return]')
    assert.equal(await page.$$eval('main:has(#suite-name) a', els => els.some(el => el.textContent.includes('返回视觉工作台'))), false)
  }
  pass('直接访问和旧来源链接都只显示返回套装列表，外部参数不会改变保存落点')

  await page.goto(base + '/suite?returnTo=%2Fremix', { waitUntil: 'networkidle0' })
  await page.waitForSelector('#suite-name')
  await page.waitForFunction(() => document.querySelector('#suite-name').value === '保存失败合成示例')
  await setValue('#suite-name', '快速刷新保留八条')
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('#suite-name').value === '快速刷新保留八条')
  assert.equal(await page.$$eval('main:has(#suite-name) [data-prompt-preview]', els => els.length), 8)
  pass('恢复草稿不会写空快照，快速刷新保留最新名称和完整八条，pagehide及时保存')
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 })
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    await delay(200)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(await page.$$eval('[data-fixed-actions]', els => els.filter(el => el.getBoundingClientRect().width).length), 1)
    assert(await page.$eval('[data-fixed-actions]', el => { const box = el.getBoundingClientRect(); return box.bottom <= innerHeight + 2 && box.top > 0 }))
    assert(await page.evaluate(() => [...document.querySelectorAll('main:has(#suite-name) [data-prompt-editor]')].at(-1).getBoundingClientRect().bottom <= [...document.querySelectorAll('[data-fixed-actions]')].find(el => el.getBoundingClientRect().width).getBoundingClientRect().top))
    await page.screenshot({ path: path.join(out, `suite-mobile-${width}.png`), fullPage: false })
  }
  await click('保存并返回套装列表')
  await page.waitForFunction(() => document.querySelector('#suite-name').value === '' && document.querySelectorAll('main:has(#suite-name) [data-prompt-preview]').length === 1)
  assert.equal(new URL(page.url()).pathname, '/suite')
  pass('八条长文在390/320px无横向溢出，固定保存操作可点且不遮末条，手机成功保存后回列表')
  assert.equal(report.modelCalls, 0)
  assert.deepEqual(report.errors, [])
  pass('全程模型调用0、真实费用0、页面异常0')
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1 }).finally(async () => {
  if (report.failure && page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true })
  if (browser) await browser.close()
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  if (report.failure) console.error(report.failure)
})
