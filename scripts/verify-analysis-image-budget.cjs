const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const JSZip = require('jszip')
const puppeteer = require('puppeteer-core')
const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII='
const POLICY = '【自定义完整系统角色】构图、商品结构与尺寸必须完整保留。'.repeat(6000)
const FINAL = '【正向 Prompt】\n' + '完整提示词，保留材质、场景、构图和光线。'.repeat(120) + '\n【负向 Prompt】禁止变形。'
async function click(page, text) {
  await page.evaluate(value => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === value).click(), text)
}
async function main() {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  const summaries = []
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 1100 })
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' })
    const fixture = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 1280
      const context = canvas.getContext('2d'); const pixels = context.createImageData(1280, 1280)
      let seed = 123456789
      for (let index = 0; index < pixels.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels.data[index + channel] = seed & 255 }
        pixels.data[index + 3] = 255
      }
      context.putImageData(pixels, 0, 0)
      return { png: canvas.toDataURL('image/png'), jpeg: canvas.toDataURL('image/jpeg', 0.92) }
    })
    const pngFile = path.resolve('verification/analysis-noise.png')
    fs.writeFileSync(pngFile, Buffer.from(fixture.png.split(',')[1], 'base64'))
    assert.ok(fixture.png.length * 3 > 3.5 * 1024 * 1024)
    const captures = []
    await page.setRequestInterception(true)
    page.on('request', async request => {
      if (!request.url().endsWith('/api/analyze')) { void request.continue(); return }
      const raw = request.postData() || await request.fetchPostData()
      captures.push({ raw, body: JSON.parse(raw) })
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ prompt: FINAL }) })
    })
    await page.evaluate(policy => {
      localStorage.clear()
      localStorage.setItem('amazon-workbench.analyzeApiKey', 'sk-fake-image-budget')
      localStorage.setItem('amazon-workbench.draft.workbench', JSON.stringify({ systemPrompt: policy }))
    }, POLICY)
    await page.reload({ waitUntil: 'networkidle0' })
    await (await page.$('input[type="file"]')).uploadFile(pngFile)
    await page.waitForFunction(() => document.body.innerText.includes('analysis-noise.png'))
    const card = (await page.evaluateHandle(() => [...document.querySelectorAll('[data-slot="card"]')].find(node => [...node.querySelectorAll('button')].some(button => button.textContent.trim() === '生成提示词')))).asElement()
    for (let index = 0; index < 2; index++) {
      await (await card.$('input[type="file"]')).uploadFile(pngFile)
      await page.waitForFunction(expected => document.querySelectorAll('img[alt^="参考图"]').length === expected, {}, index + 1)
    }
    await click(page, '生成提示词')
    await page.waitForFunction(expected => [...document.querySelectorAll('textarea')].some(field => field.value === expected), { timeout: 30000 }, FINAL)
    const first = captures[0]
    assert.equal(first.body.images.length, 3)
    assert.equal(first.body.systemPrompt, POLICY)
    assert.deepEqual(first.body.images.map(image => [image.role, image.index]), [['product', 1], ['reference', 2], ['reference', 3]])
    const check = capture => {
      const bodyBytes = Buffer.byteLength(capture.raw, 'utf8')
      const imagesBytes = capture.body.images.reduce((total, image) => total + image.dataUrl.length, 0)
      assert.ok(bodyBytes <= 4 * 1024 * 1024)
      assert.ok(imagesBytes <= 3.5 * 1024 * 1024)
      return { images: capture.body.images.length, bodyBytes, imagesBytes }
    }
    const originalImages = await page.$$eval('img[alt="我方产品图"], img[alt^="参考图"]', images => images.map(image => image.getAttribute('src')))
    assert.ok(originalImages.some(src => src.length > first.body.images[0].dataUrl.length))
    summaries.push({ scenario: 'large-png-and-utf8-policy', ...check(first), originalImageChars: fixture.png.length * 3, policyPreserved: true, allImagesPreserved: true })
    console.log('PASS: 产品 PNG + 两张大 PNG 参考图自动适配，完整中文系统角色、图片身份与全部提示词不变')

    const zip = new JSZip()
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c t="inlineStr"><is><t>主视觉 | 保持全部参考图与商品结构</t></is></c></row></sheetData></worksheet>')
    for (let index = 1; index <= 12; index++) zip.file('xl/media/image' + index + '.jpg', Buffer.from(fixture.jpeg.split(',')[1], 'base64'))
    const docFile = path.resolve('verification/analysis-many-refs.xlsx')
    fs.writeFileSync(docFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
    assert.ok(fs.statSync(docFile).size < 20 * 1024 * 1024)
    await page.goto('http://localhost:3000/planner', { waitUntil: 'networkidle0' })
    await (await page.$('input[accept*="image/png"]')).uploadFile(pngFile)
    await page.waitForFunction(() => document.body.innerText.includes('analysis-noise.png'))
    await (await page.$('input[accept=".docx,.xlsx,.csv,.txt"]')).uploadFile(docFile)
    await page.waitForFunction(() => document.body.innerText.includes('12 张内嵌图片'), { timeout: 30000 })
    await click(page, '开始策划')
    await page.waitForFunction(expected => [...document.querySelectorAll('textarea')].some(field => field.value === expected), { timeout: 45000 }, FINAL)
    assert.equal(captures[1].body.images.length, 13)
    assert.deepEqual(captures[1].body.images.map(image => image.index), Array.from({ length: 13 }, (_, index) => index + 1))
    summaries.push({ scenario: 'planner-twelve-document-references', ...check(captures[1]), allImagesPreserved: true })
    console.log('PASS: 策划文档 12 张大参考图与产品图共 13 张全部提交，无静默丢图')

    await page.evaluate(image => {
      localStorage.removeItem('amazon-workbench.draft.workbench')
      localStorage.setItem('amazon-workbench.draft.workbench', JSON.stringify({ productImage: { id: 'tiny', name: 'tiny.png', dataUrl: image } }))
    }, TINY)
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' })
    await click(page, '生成提示词')
    await page.waitForFunction(expected => [...document.querySelectorAll('textarea')].some(field => field.value === expected), { timeout: 10000 }, FINAL)
    assert.equal(captures[2].body.images[0].dataUrl, TINY)
    summaries.push({ scenario: 'small-image-unchanged', ...check(captures[2]) })
    console.log('PASS: 已符合上限的小图保持原数据，不重复压缩；返回提示词全文保留')
    fs.writeFileSync('verification/analysis-image-budget.json', JSON.stringify(summaries, null, 2))
    console.log(JSON.stringify(summaries))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
