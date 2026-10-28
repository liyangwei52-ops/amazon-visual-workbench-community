// No browser data or network: exercise the real store with an isolated image store.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const originalLoad = Module._load
const originalResolve = Module._resolveFilename
const imageRecords = new Map()
const deleted = []
let afterWrite = null
let failedStorageKey = ''
const storage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (key === failedStorageKey) throw Error('mock storage failure'); values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
    clear() { values.clear() },
  }
}
global.localStorage = storage()
global.sessionStorage = storage()
global.window = new EventTarget()
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.resolve(__dirname, '../src', request.slice(2)) : request, ...args)
}
Module._load = function (request, ...args) {
  if (request === '@/lib/browser-image-store') return {
    async readImageRecord(id) { return imageRecords.get(id) },
    async writeImageRecord(id, value) { imageRecords.set(id, value); if (afterWrite) await afterWrite(id) },
    async deleteImageRecord(id) { deleted.push(id); imageRecords.delete(id) },
  }
  return originalLoad.call(this, request, ...args)
}
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename)
const storePath = path.resolve(__dirname, '../src/lib/generate-queue-store.ts')
const store = require(storePath)
const { GENERATE_QUEUE_KEY, GENERATE_ORIGIN_KEY, QUEUE_HOLD_KEY } = require('../src/lib/visual-shared.ts')
const task = (id, status = 'queued', extra = {}) => ({
  id, label: id, ratio: '1:1', customSize: '', quality: '2k', count: 1, prompt: '完整提示词，商品实测尺寸12cm。',
  productImageDataUrl: 'data:product-new', productImages: [{ dataUrl: 'data:product-new', name: '主产品.png' }],
  references: [{ dataUrl: 'data:reference-new', name: '竞品.png' }], status, resultUrls: [], ...extra,
})
function seed(tasks) {
  localStorage.clear(); sessionStorage.clear(); imageRecords.clear(); deleted.length = 0; afterWrite = null; failedStorageKey = ''
  localStorage.setItem(GENERATE_QUEUE_KEY, JSON.stringify(tasks))
  localStorage.setItem(GENERATE_ORIGIN_KEY, '/planner')
}

async function main() {
  const old = [task('same', 'success', { count: 2, resultUrls: ['https://fixture.invalid/first.png'], inputBatchId: 'old-input' }), task('unknown', 'interrupted')]
  seed(old)
  imageRecords.set('old-input', { images: ['data:old-product'], tasks: [{ id: 'same', product: 0, references: [] }] })
  localStorage.setItem(QUEUE_HOLD_KEY, 'true')
  assert.equal(await store.submitGenerateQueue([task('same')], '/simple'), 'saved')
  let queue = store.readGenerateQueue()
  assert.equal(queue.length, 3)
  assert.deepEqual(queue.slice(0, 2).map(t => [t.id, t.status, t.resultUrls, t.prompt]), old.map(t => [t.id, t.status, t.resultUrls, t.prompt]))
  assert.equal(queue[0].origin, '/planner', '旧队列读取原来源')
  assert.equal(queue[2].origin, '/simple')
  assert.notEqual(queue[2].id, 'same', '同名新条目不能覆盖旧任务/图片')
  assert.equal(queue[2].sourceEntryId, 'same')
  assert.equal(queue[2].status, 'queued')
  assert.equal(store.hasCurrentPageSubmission(queue), true)
  assert.equal(store.hasCurrentPageSubmission(queue.slice(0, 2)), false, '旧待确认/缺图没有新增执行授权')
  assert.equal(deleted.length, 0, '保留旧输入')
  const hydrated = await store.hydrateTaskInputs(queue)
  assert.equal(hydrated[0].productImageDataUrl, 'data:old-product')
  assert.deepEqual(hydrated[2].productImages, [{ dataUrl: 'data:product-new', name: '主产品.png' }])
  assert.deepEqual(hydrated[2].references, [{ dataUrl: 'data:reference-new', name: '竞品.png' }])
  assert.equal(store.readGeneratePaused('/simple'), false)
  assert.equal(store.readGeneratePaused('/planner'), true, '新栏目不清除旧栏目暂停状态')

  for (const status of ['queued', 'running']) {
    seed([task('active', status)])
    assert.equal(await store.submitGenerateQueue([task('new')], '/planner'), 'blocked')
    assert.equal(imageRecords.size, 0)
    assert.equal(store.readGenerateQueue()[0].id, 'active')
    assert.equal(await store.submitGenerateQueue([task('new')], '/simple'), 'saved', '另一栏目可在旧栏目运行/排队时独立提交')
    assert.equal(store.readGenerateQueue('/planner')[0].status, status)
  }

  seed(old)
  const before = localStorage.getItem(GENERATE_QUEUE_KEY)
  failedStorageKey = store.generateQueueKey('/simple')
  assert.equal(await store.submitGenerateQueue([task('new')], '/simple'), 'failed')
  assert.equal(localStorage.getItem(GENERATE_QUEUE_KEY), before, '存储失败保留旧队列')
  assert.equal(imageRecords.size, 0, '失败后不留下新输入')

  seed(old)
  afterWrite = async () => { store.persistGenerateQueue([task('other-tab', 'running')], '/simple'); afterWrite = null }
  assert.equal(await store.submitGenerateQueue([task('new')], '/simple'), 'blocked')
  assert.equal(store.readGenerateQueue('/simple')[0].id, 'other-tab', '异步写入期间不覆盖同栏目另一标签页更新')
  assert.equal(imageRecords.size, 0)

  seed(old)
  let releaseWrite
  afterWrite = () => new Promise(resolve => { releaseWrite = resolve })
  const first = store.submitGenerateQueue([task('double')], '/simple')
  while (!releaseWrite) await new Promise(resolve => setImmediate(resolve))
  assert.equal(await store.submitGenerateQueue([task('double')], '/simple'), 'blocked')
  releaseWrite()
  assert.equal(await first, 'saved')
  assert.equal(store.readGenerateQueue().filter(t => t.sourceEntryId === 'double').length, 1)

  seed([task('uncertain', 'interrupted')])
  assert.equal(await store.submitRedrawQueue({ missing: [0] }, '/planner'), 'blocked')
  assert.equal(await store.submitRedrawQueue({ uncertain: [0] }, '/simple'), 'blocked', '不能跨栏目重绘')
  assert.equal(await store.submitRedrawQueue({ uncertain: [0] }, '/planner'), 'saved')
  assert.equal(store.readGenerateQueue().length, 1, '原位重绘不追加任务')
  assert.equal(store.readGenerateQueue()[0].id, 'uncertain')
  assert.deepEqual(store.readGenerateQueue()[0].redraw.pending, [0])
  assert.equal(store.hasCurrentPageSubmission(store.readGenerateQueue('/planner')), true)

  seed([task('original', 'success', { count: 3, resultUrls: ['https://fixture.invalid/a', 'https://fixture.invalid/b', 'https://fixture.invalid/c'] })])
  const original = store.readGenerateQueue('/planner')[0]
  failedStorageKey = store.generateQueueKey('/planner')
  assert.equal(await store.submitRedrawQueue({ original: [1] }, '/planner'), 'failed')
  assert.equal(store.readGenerateQueue('/planner')[0].status, 'success', '重绘保存失败原记录不变')
  failedStorageKey = ''
  const redrawFirst = store.submitRedrawQueue({ original: [1] }, '/planner')
  assert.equal(await store.submitRedrawQueue({ original: [1] }, '/planner'), 'blocked', '重复点击只能提交一次')
  assert.equal(await redrawFirst, 'saved')
  const inPlace = store.readGenerateQueue('/planner')
  assert.equal(inPlace.length, 1)
  assert.equal(inPlace[0].id, original.id)
  assert.equal(inPlace[0].count, 3)
  assert.deepEqual(inPlace[0].resultUrls, original.resultUrls)
  assert.deepEqual(inPlace[0].productImages, original.productImages)
  assert.deepEqual(inPlace[0].redraw.pending, [1])
  assert.equal(await store.submitRedrawQueue({ original: [2] }, '/planner'), 'blocked', '运行/排队保护仍有效')
  const reloadRedraw = () => { delete require.cache[storePath]; return require(storePath) }
  assert.equal(reloadRedraw().hasCurrentPageSubmission(inPlace), false, '刷新不恢复重绘授权')

  seed([task('complete', 'success', { resultUrls: ['https://fixture.invalid/done.png'] })])
  assert.equal(await store.submitGenerateQueue([task('new')], '/planner'), 'saved')
  queue = store.readGenerateQueue()
  assert.deepEqual(queue.map(t => t.sourceEntryId), ['new'], '同栏目无需核查的已结束旧批次沿用原替换规则')
  assert.equal(store.hasCurrentPageSubmission(queue), true)
  delete require.cache[storePath]
  const reloaded = require(storePath)
  assert.equal(reloaded.hasCurrentPageSubmission(queue), false, '刷新模块不恢复新批次的执行意图')
  assert.equal(reloaded.taskGenerateOrigin({ ...queue[0], origin: undefined }, '/planner'), '/planner')

  const five = Array.from({ length: 5 }, (_, i) => task('result-' + i, 'success', { sourceEntryId: 'entry-' + i, inputBatchId: 'same-list', resultUrls: ['https://fixture.invalid/' + i] }))
  seed(five)
  store.persistGenerateQueue(five, '/planner')
  const unselected = store.readGenerateQueue('/planner').filter(t => t.sourceEntryId !== 'entry-2')
  assert.equal(await store.submitGenerateQueue([task('entry-2', 'queued', { prompt: '只修改第三条' })], '/planner', five.map(t => t.sourceEntryId)), 'saved')
  const incremental = store.readGenerateQueue('/planner')
  assert.equal(incremental.length, 5)
  assert.deepEqual(incremental.map(t => t.id), five.map(t => t.id))
  assert.deepEqual(incremental.filter(t => t.sourceEntryId !== 'entry-2'), unselected.map(t => ({ ...t, generationBatchId: 'same-list', generationEntryIds: five.map(t => t.sourceEntryId) })), '旧格式仅补齐清单元数据，未启用内容及图片保留')
  assert.equal(incremental[2].prompt, '只修改第三条')
  assert.deepEqual(incremental[2].redraw.pending, [0])
  assert.deepEqual(incremental[2].resultUrls, five[2].resultUrls)
  assert.equal(incremental[2].generationBatchId, 'same-list')
  assert.equal(store.hasCurrentPageSubmission(incremental.filter(t => t.status === 'success')), false)
  assert.equal(store.hasCurrentPageSubmission(incremental.filter(t => t.status === 'queued')), true)
  assert.deepEqual((await store.hydrateTaskInputs([incremental[2]]))[0].productImages, [{ dataUrl: 'data:product-new', name: '主产品.png' }])
  seed([{ ...five[2], status: 'interrupted' }])
  let confirmations = 0
  window.confirm = () => { confirmations++; return false }
  assert.equal(await store.submitGenerateQueue([task('entry-2')], '/planner'), 'cancelled')
  assert.equal(imageRecords.size, 0, '取消确认不写素材，不授予发送')
  assert.equal(store.readGenerateQueue('/planner')[0].status, 'interrupted')
  window.confirm = () => { confirmations++; return true }
  assert.equal(await store.submitGenerateQueue([task('entry-2')], '/planner'), 'saved')
  assert.equal(confirmations, 2)

  seed([])
  let finishFirst
  let firstWrite = true
  afterWrite = () => {
    if (!firstWrite) return
    firstWrite = false
    return new Promise(resolve => { finishFirst = resolve })
  }
  const planner = reloaded.submitGenerateQueue([task('identical-entry')], '/planner')
  while (!finishFirst) await new Promise(resolve => setImmediate(resolve))
  assert.equal(await reloaded.submitGenerateQueue([task('identical-entry')], '/simple'), 'saved', '栏目提交锁互不影响')
  finishFirst()
  assert.equal(await planner, 'saved')
  const plans = reloaded.readGenerateQueue('/planner'), simples = reloaded.readGenerateQueue('/simple')
  assert.notEqual(plans[0].id, simples[0].id, '同名编辑条目跨栏目也必须分配独立结果主键')
  assert.equal(reloaded.hasCurrentPageSubmission(plans), true)
  assert.equal(reloaded.hasCurrentPageSubmission(simples), true, '另一栏目新提交不能清除本栏目内存意图')
  localStorage.setItem(reloaded.generateHoldKey('/planner'), 'true')
  assert.equal(reloaded.readGeneratePaused('/planner'), true)
  assert.equal(reloaded.readGeneratePaused('/simple'), false)
  reloaded.persistGenerateQueue([], '/planner')
  reloaded.releaseQueueInputs(plans)
  assert.equal(reloaded.readGenerateQueue('/simple').length, 1)
  assert.ok(imageRecords.has(simples[0].inputBatchId), '清空一个栏目不能删除另一栏目输入')
  assert.notEqual(reloaded.generateLockKey('/planner'), reloaded.generateLockKey('/simple'))

  seed([task('shared-plan', 'interrupted', { origin: '/planner', inputBatchId: 'shared' }), task('shared-simple', 'interrupted', { origin: '/simple', inputBatchId: 'shared' })])
  imageRecords.set('shared', { images: [], tasks: [] })
  const legacyPlans = reloaded.readGenerateQueue('/planner'), legacySimple = reloaded.readGenerateQueue('/simple')
  reloaded.persistGenerateQueue([], '/planner'); reloaded.releaseQueueInputs(legacyPlans)
  assert.ok(imageRecords.has('shared'), '旧混合队列共用输入必须等全部栏目释放')
  assert.equal(reloaded.readGenerateQueue('/planner').length, 0, '清空后不复活旧全局记录')
  reloaded.persistGenerateQueue([], '/simple'); reloaded.releaseQueueInputs(legacySimple)
  assert.equal(imageRecords.has('shared'), false)

  const held = new Set()
  Object.defineProperty(global.navigator, 'locks', { configurable: true, value: { async request(name, options, action) {
    if (held.has(name)) return action(null)
    held.add(name)
    try { return await action({ name }) } finally { held.delete(name) }
  } } })
  seed([])
  let releasePlannerLock
  const running = reloaded.withGenerateQueueLock('/planner', () => new Promise(resolve => { releasePlannerLock = resolve }))
  while (!releasePlannerLock) await new Promise(resolve => setImmediate(resolve))
  assert.equal(await reloaded.withGenerateQueueLock('/planner', async () => assert.fail('重复执行')), false)
  assert.equal(await reloaded.withGenerateQueueLock('/simple', async () => {}), true, '不同栏目Web Lock可同时运行')
  releasePlannerLock(); assert.equal(await running, true)
  seed([task('legacy-active', 'queued')])
  held.add('amazon-workbench.generate-queue')
  assert.equal(await reloaded.withGenerateQueueLock('/planner', async () => assert.fail('旧版仍在运行')), false)
  assert.equal(await reloaded.withGenerateQueueLock('/simple', async () => {}), true, '旧执行锁不阻止没有旧任务的其他栏目')
  held.clear()

  seed([])
  assert.equal(await reloaded.submitGenerateQueue([], '/simple'), 'failed')
  assert.equal(imageRecords.size, 0)
  console.log('PASS: 栏目队列/暂停/提交意图/Web Lock独立；跨栏目同时提交；同名ID隔离；清空仅本栏目；旧来源与共享输入兼容；旧执行锁保护；失败/重复点击/同栏目跨标签零覆盖；刷新不授权（零网络）')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
