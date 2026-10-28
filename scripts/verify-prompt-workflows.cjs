// UI/protocol integration only. Isolated Edge; every model endpoint intercepted; synthetic assets and key.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript')
const puppeteer = require('puppeteer-core'), sharp = require('sharp')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const { PREVIOUS_VISUAL_STRATEGIST_SYSTEM_PROMPT, VISUAL_STRATEGIST_SYSTEM_PROMPT } = require('../src/lib/visual-strategist-prompt.ts')
const { REMIX_STRATEGIST_SYSTEM_PROMPT } = require('../src/lib/remix-strategist-prompt.ts')
const { PLANNER_SYSTEM_PROMPT } = require('../src/lib/planner-strategist-prompt.ts')
const { LEGACY_VISUAL_STRATEGIST_V12 } = require('../src/lib/legacy-visual-strategist-v12.ts')
const { WORKBENCH_REFERENCE_RULES, WORKBENCH_REFERENCE_TASK_NOTE } = require('../src/lib/workbench-reference-policy.ts')
const { LOCAL_SCENE_VARIATION_RULES, LOCAL_SCENE_VARIATION_TASK_NOTE } = require('../src/lib/local-scene-variation.ts')
const { ANALYSIS_COPY_TASK_NOTE, MARKETING_COPY_RULES, PRECISE_SCENE_RULES } = require('../src/lib/analysis-prompt-rules.ts')
const { requestedCanvas } = require('../src/lib/model-image-plan.ts')
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3037'
const OUT = path.resolve(process.env.TEST_OUTPUT_DIR || 'verification/prompt-workflows-20261019/local')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(test, label) { const end = Date.now() + 20000; while (!await test()) { if (Date.now() > end) throw Error('Timed out: ' + label); await delay(40) } }
// Synthetic protocol fixture; these shapes and layout estimates are not real product measurements.
const fullPrompt = (marker, copy) => `【正向 Prompt】\n画面任务：${marker}，画布5:4，仅展示一支笔。白色直圆柱笔身、下端圆锥笔尖、上端笔帽及贴近笔身的纵向笔夹，黑色线条印花只在笔身表面。整幅左上为原点，横纵百分比均相对画布：产品区x=5%至60%、y=8%至92%，笔中心x=30%、y=56%，长轴竖直，高度占画布64%；三个细节框均为x=66%至95%，y依次为8%至32%、36%至60%、64%至88%，分别展示同一支笔的笔夹连接、印花与笔尖。浅色背景，无人物，左上柔光，产品与文字清晰。上图文字：“${copy}”一次，文字框x=8%至55%、y=9%至17%，一行居中、黑色粗体无衬线、字高为画布高度4%。${'保留全部细节，不压缩；'.repeat(150)}\n【负向 Prompt】\n禁止旧商品红色、旧品牌与多余配件，不增加销售数量或第四个细节框，不虚构尺寸。END:${marker}`
const fence = text => '```text\n' + text + '\n```'
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const img = 'data:image/png;base64,' + (await sharp({ create: { width: 96, height: 96, channels: 3, background: '#b6d0c4' } }).png().toBuffer()).toString('base64')
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] })
  const reports = [], errors = []
  try {
    for (const model of ['gpt-image-2', 'gemini-3-pro-image-preview']) {
      for (const route of ['/', '/remix', '/planner']) {
        const context = await browser.createBrowserContext(), page = await context.newPage(), calls = [], imageCalls = []
        await page.setViewport({ width: 1440, height: 1000 })
        page.on('pageerror', error => errors.push(error.message))
        await page.setRequestInterception(true)
        const marker = route === '/' ? 'visual' : route.slice(1)
        const copy = model.startsWith('gpt') ? 'Alles Gute!' : 'For Your Everyday Notes'
        const siteBrief = model.startsWith('gpt') ? '目标站点：德国站（DE）。用户指定最终标题“Alles Gute!”；其他文字按对应参考改写。' : '目标站点：美国站（US）。未指定最终文案，可参考文档/竞品中的“日常书写”意思改写为英语，图片营销文字不能有中文。'
        const productInfo = '新商品仅凭图片，未提供实测尺寸。' + siteBrief
        const expected = fullPrompt(marker, copy)
        let rejectAnalysis = false
        page.on('request', request => {
          const url = new URL(request.url())
          if (url.pathname === '/api/provider-transport') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }) })
          if (url.pathname === '/api/analyze') {
            const body = JSON.parse(request.postData()); calls.push(body)
            const output = rejectAnalysis ? '【无法完成】本条所需的圆珠笔未出现在新产品资料中。' : route === '/' ? '【最终 AI 绘图 Prompt】\n' + fence(expected) : route === '/remix' ? '【提示词 1】\n' + fence(expected) : '【提示词 1｜主图】\n【最终 AI 绘图 Prompt】\n' + fence(expected) + '\n【提示词 2｜单品细节】\n【最终 AI 绘图 Prompt】\n' + fence(expected.replaceAll('画布5:4', '画布1:3').replaceAll('END:planner', 'END:planner2'))
            return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ prompt: output }) })
          }
          if (url.pathname === '/api/images') { imageCalls.push(request.url()); return void request.abort() }
          if (url.pathname.startsWith('/api/') || (!request.url().startsWith(BASE) && !request.url().startsWith('data:'))) return void request.abort()
          void request.continue().catch(() => {})
        })
        await page.goto(BASE + '/settings', { waitUntil: 'networkidle0' })
        await page.evaluate(({ route, model, img, oldDefault, productInfo, siteBrief }) => {
          const connection = { endpoint: 'https://api.openlux.ai/v1', apiKey: 'mock-prompt-workflows-only', model: 'mock-analysis' }
          localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify({ analysis: connection, image: { ...connection, model } }))
          const products = [{ id: 'p1', name: '主产品.png', dataUrl: img }, { id: 'p2', name: '补充产品.png', dataUrl: img }]
          const entry = { id: 'first', title: '商品概览', enabled: true, prompt: 'OLD_PRODUCT 旧红色商品；只展示一支笔和三个局部框；旧标题“Daily Notes”位于左上文字框，旧画幅16:9。', size: 'custom', customSize: '5:4', quality: '1k', count: '1', sizeUserSet: true, extraNeeds: '只展示一支笔和三个细节，不展示整套。标题文案细节可以照抄，背景不能照抄；人物面孔、左右位置和室内外未锁定，可以按用途调整。', references: [{ id: 'r1', name: '构图.png', dataUrl: img }] }
          const draft = { productImages: products, productInfo, ...(route === '/' ? { systemPrompt: oldDefault, cards: [entry] } : { entries: route === '/planner' ? [entry, { ...entry, id: 'second', title: '单品细节', customSize: '1:3' }] : [entry] }) }
          if (route === '/planner') { draft.planText = '商品概览｜保留参考的标题及产品展示模块\n单品细节｜仅笔及三个局部框；补充文本优先。'; draft.planDoc = { fileName: 'synthetic.xlsx', type: 'xlsx', size: 1000, text: 'Sheet1 第3行 商品概览；第7行 单品细节。' + siteBrief, images: [{ name: 'ref-row3.png', dataUrl: img, source: 'Sheet1 第3行' }, { name: 'ref-row7.png', dataUrl: img, source: 'Sheet1 第7行' }], droppedImages: 0 } }
          localStorage.setItem(route === '/' ? 'amazon-workbench.draft.workbench' : route === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.planner', JSON.stringify(draft))
        }, { route, model, img, oldDefault: LEGACY_VISUAL_STRATEGIST_V12, productInfo, siteBrief })
        await page.goto(BASE + route, { waitUntil: 'networkidle0' })
        const label = route === '/' ? '生成提示词 1 条' : route === '/remix' ? '改写提示词 1 条' : '开始策划'
        async function click() {
          await page.waitForFunction(label => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === label && !el.disabled && el.getBoundingClientRect().width > 0), {}, label)
          await page.evaluate(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label && el.getBoundingClientRect().width > 0).click(), label)
        }
        await click()
        await until(() => page.evaluate(marker => [...document.querySelectorAll('textarea')].some(el => el.value.includes('END:' + marker)), marker), 'prompt distributed ' + route)
        assert.equal(calls.length, 1)
        const body = calls[0]
        const expectedRole = route === '/' ? VISUAL_STRATEGIST_SYSTEM_PROMPT : route === '/remix' ? REMIX_STRATEGIST_SYSTEM_PROMPT : PLANNER_SYSTEM_PROMPT
        assert.ok(body.systemPrompt.startsWith(expectedRole), '实际页面应发送完整当前角色，工作台v13、迁移v9、策划v10')
        assert.ok(body.userText.includes(productInfo), '完整商品信息及站点/用户指定或参考改写需求继续发送')
        assert.ok(body.userText.includes(ANALYSIS_COPY_TASK_NOTE), '三入口实际用户消息采用同一文案与直接描述要求')
        assert.ok(body.systemPrompt.includes(MARKETING_COPY_RULES) && body.systemPrompt.includes(PRECISE_SCENE_RULES), '三处实际系统请求均含完整共享新规则')
        assert.ok(!/按15项顺序完整展开|重写完整15项|逐版位写完整15项/.test(body.userText), 'outer user message must not reinstate the old field mandate')
        assert.ok(body.systemPrompt.startsWith(route === '/' ? '# 视觉工作台｜Amazon 电商视觉策略师与商品图提示词工程师 v13' : route === '/remix' ? '# 提示词迁移｜图位语义与产品映射师 v9' : '# 一键策划｜整套商品视觉内容策划师 v10'))
        assert.equal(body.systemPrompt.includes(WORKBENCH_REFERENCE_RULES), route === '/', '额外需求优先/灵活参考只进入工作台系统消息')
        assert.equal(body.userText.includes(WORKBENCH_REFERENCE_TASK_NOTE), route === '/', '工作台本卡消息使用相同参考边界')
        assert.equal(body.systemPrompt.includes(LOCAL_SCENE_VARIATION_RULES), route === '/remix', '迁移原局部规则保留且不与新工作台叠加')
        assert.equal(body.userText.includes(LOCAL_SCENE_VARIATION_TASK_NOTE), route === '/remix')
        if (route !== '/remix') {
          const workflow = '竞品视觉拆解 → 我方产品识别 → 产品硬约束 → 竞品视觉映射 → 完整成品 Prompt'
          assert.ok(body.systemPrompt.includes(workflow) && body.userText.includes(workflow), '系统与本条请求采用同一完整流程')
          assert.ok(body.userText.includes('先核对产品结构再映射'), '产品结构核对先于视觉映射')
        }
        if (route === '/') {
          assert.ok(body.userText.startsWith('【本卡额外需求，优先于参考默认，须逐项落实到成品画面】\n只展示一支笔和三个细节，不展示整套。标题文案细节可以照抄，背景不能照抄；人物面孔、左右位置和室内外未锁定，可以按用途调整。'), '本卡原始额外需求完整置前，不被默认参考规则压后或改写')
          assert.equal((body.userText.match(/标题文案细节可以照抄，背景不能照抄/g) || []).length, 1, '额外需求不重复叠加')
          assert.ok(body.userText.includes('部件数量与连接') && body.userText.includes('文字框位置与字体层级'), '本卡用户消息同步要求具体结构、布局与逐条文案定位')
          assert.ok(body.userText.includes('禁止以参考图编号') && body.userText.includes('不编造商品实测值'))
        }
        assert.ok(body.systemPrompt.includes('不是15个成品字段'))
        assert.ok(body.systemPrompt.includes('上传产品图不等于每张都要放产品'))
        assert.ok(body.systemPrompt.includes('额外上图文字：无'))
        assert.ok(body.systemPrompt.includes('无文字只约束文字'))
        assert.ok(body.systemPrompt.includes(model.startsWith('gemini') ? '【目标生图模型｜Gemini Image】' : '【目标生图模型｜GPT Image】'))
        assert.deepEqual(body.images.map(image => image.role), ['product', 'product-detail', ...Array(route === '/' ? 1 : route === '/planner' ? 2 : 0).fill('reference')])
        assert.deepEqual(body.images.map(image => image.index), Array.from({ length: body.images.length }, (_, i) => i + 1))
        assert.ok(body.userText.includes(requestedCanvas('5:4', '1k', 'custom', model)), '传入当前模型适配画布')
        assert.ok(body.userText.includes(siteBrief))
        if (route === '/planner') { assert.ok(body.userText.includes('Sheet1 第3行')); assert.ok(body.userText.includes('Sheet1 第7行')); assert.ok(body.userText.includes(requestedCanvas('1:3', '1k', 'custom', model))); assert.ok(await page.evaluate(() => [...document.querySelectorAll('textarea')].some(el => el.value.includes('END:planner2')))) }
        if (route === '/remix') assert.ok(body.userText.includes('OLD_PRODUCT'))
        assert.ok(await page.evaluate(marker => [...document.querySelectorAll('textarea')].some(el => el.value.includes('END:' + marker) && el.value.includes('保留全部细节，不压缩；'.repeat(150)) && el.value.includes('【负向 Prompt】')), marker))
        assert.ok(await page.evaluate(({ marker, copy }) => [...document.querySelectorAll('textarea')].some(el => el.value.includes('END:' + marker) && el.value.includes('“' + copy + '”') && el.value.includes('文字框x=8%至55%')), { marker, copy }), '本地化原文及精确文字框不被解析或画布适配改写')
        // A model-declared inability must leave the previous successful prompt intact and show its exact reason.
        rejectAnalysis = true
        await click()
        await until(() => page.evaluate(() => document.body.innerText.includes('圆珠笔未出现在新产品资料中')), 'reason preserved')
        assert.equal(calls.length, 2)
        assert.ok(await page.evaluate(marker => [...document.querySelectorAll('textarea')].some(el => el.value.includes('END:' + marker)), marker), `failure retains prompt ${route} ${model}`)
        assert.equal(imageCalls.length, 0)
        if (model.startsWith('gpt')) await page.screenshot({ path: OUT + '/' + marker + '-failure-old-prompt-kept.png', fullPage: true })
        await until(() => page.evaluate(({ route, marker }) => {
          const key = route === '/' ? 'amazon-workbench.draft.workbench' : route === '/remix' ? 'amazon-workbench.remixDraft' : 'amazon-workbench.draft.planner'
          return (localStorage.getItem(key) || '').includes('END:' + marker)
        }, { route, marker }), 'debounced draft saved ' + route)
        await page.reload({ waitUntil: 'networkidle0' }); await delay(200)
        assert.equal(calls.length, 2, '刷新零自动分析/重试')
        await until(() => page.evaluate(marker => [...document.querySelectorAll('textarea')].some(el => el.value.includes('END:' + marker)), marker), `draft restored ${route} ${model}`)
        reports.push({ route, imageModel: model, mockAnalysisCalls: calls.length, roleVersion: route === '/' ? 13 : route === '/remix' ? 9 : 10, workbenchReferencePolicyScoped: true, extraNeedsFirstAndIntact: route === '/', copyScenario: model.startsWith('gpt') ? 'DE-user-locked-title' : 'US-reference-rewrite', exactCurrentRoleSent: true, sharedCopyRulesAndTaskNote: true, intentAndCopyBoundary: true, fullImagesAndCurrentCanvas: true, completePromptDistributed: true, failureReasonPreserved: true, oldPromptKeptOnFailure: true, refreshNoResend: true, imageCalls: imageCalls.length })
        // A personal role remains personal across reload; the exact built-in migration is the only automatic replacement.
        if (route === '/' && model.startsWith('gpt')) {
          const personal = 'CUSTOM_PERSONAL_SYSTEM_DONT_REPLACE\n' + PREVIOUS_VISUAL_STRATEGIST_SYSTEM_PROMPT
          await page.evaluate(role => { const k = 'amazon-workbench.draft.workbench'; const draft = JSON.parse(localStorage.getItem(k)); draft.systemPrompt = role; localStorage.setItem(k, JSON.stringify(draft)) }, personal)
          await page.reload({ waitUntil: 'networkidle0' }); rejectAnalysis = false; await click()
          await until(() => calls.length === 3, 'personal role request')
          assert.ok(calls[2].systemPrompt.startsWith(personal))
          reports.push({ scenario: 'personal-role', exactUserSystemKept: true, mockAnalysisCalls: 1 })
        }
        await context.close()
      }
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(OUT + '/results.json', JSON.stringify({ baseURL: BASE, browser: 'isolated headless Edge', reports, mockAnalysisCalls: 13, realPaidRequests: 0, errors, qualityLimit: 'Protocol/UI simulation; no real LLM or image-quality evaluation' }, null, 2))
    console.log('PASS: 工作台V13额外需求原文置前/独立参考策略、迁移V9/策划V10保持、三处文案/直接描述、完整回填/失败保留、v12升级/个人角色保留、刷新零重发（全模拟）')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
