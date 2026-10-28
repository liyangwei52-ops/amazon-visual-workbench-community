const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const puppeteer = require('puppeteer-core')
require.extensions['.ts']=(module,filename)=>module._compile(require('typescript').transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:1,target:9,esModuleInterop:true}}).outputText,filename)
const {parseRemixRewrite}=require('../src/lib/remix-parse.ts')
const ROOT = 'G:/2026/10月/测试'
const OUT = path.resolve('verification/three-real-tests')
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
fs.mkdirSync(OUT, { recursive: true })
const configLines = fs.readFileSync(path.join(ROOT, 'api.txt'), 'utf8').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
const after = label => configLines[configLines.indexOf(label) + 1]
const model = value => value === '5.6 Sol' ? 'gpt-5.6-sol' : value
const settings = {
  analysis: { endpoint: after('Api网址'), apiKey: after('Key'), model: model(after('分析模型')) },
  image: { endpoint: after('生图Api网址'), apiKey: after('生图Key'), model: configLines.find(x => x.startsWith('图像模型')).replace(/^图像模型[:：\s]*/, '') },
}
assert.ok(settings.analysis.apiKey?.length > 15 && settings.image.apiKey?.length > 15)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = value => console.log(new Date().toISOString(), JSON.stringify(value))
async function click(page, label) {
  const found = await page.evaluate(label => {
    const button = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === label && !x.disabled)
    if (!button) return false
    button.click(); return true
  }, label)
  assert.ok(found, 'Button unavailable: ' + label)
}
async function readEntries(page, selector) { return page.$$eval(selector, fields => fields.map(x => x.value)) }
async function saveSuite(page, name) {
  await click(page, '保存为套装')
  await page.waitForSelector('dialog[open] input')
  await page.$eval('dialog[open] input', (el, name) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, name)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, name)
  await click(page, '保存套装')
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  const suites = await page.evaluate(() => JSON.parse(localStorage.getItem('amazon-workbench.suites') || '[]'))
  fs.writeFileSync(path.join(OUT, 'saved-suites.json'), JSON.stringify(suites, null, 2))
  return suites.find(x => x.name === name)
}
async function main() {
  const phase = process.argv[2] || 'workbench'
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: path.join(OUT, process.env.TEST_BROWSER_PROFILE || 'browser-profile'), protocolTimeout: 1200000, args: ['--no-sandbox', '--disable-gpu'] })
  fs.writeFileSync(path.join(OUT,'active-browser-port.txt'),new URL(browser.wsEndpoint()).port)
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(30000)
    await page.setViewport({ width: 1600, height: 1000 })
    page.on('pageerror', error => log({ pageError: error.message }))
    let responseIndex = fs.readdirSync(OUT).filter(name=>name.startsWith(phase+'-analysis-')&&name.endsWith('.json')).length
    page.on('response', async response => {
      if (!response.url().endsWith('/api/analyze')) return
      try {
        const body = JSON.parse(response.request().postData() || await response.request().fetchPostData())
        const data = await response.json()
        const index = ++responseIndex
        fs.writeFileSync(path.join(OUT, `${phase}-analysis-${String(index).padStart(2,'0')}.json`), JSON.stringify({ status: response.status(), imageCount: body.images.length, imageRoles: body.images.map(x => x.role), userText: body.userText, ...data }, null, 2))
        // Responses never contain credentials; remove provider errors if they echo a key.
        log({ phase, analysis: index, status: response.status(), imageCount: body.images.length, promptChars: data.prompt?.length, error: data.error?.replaceAll(settings.analysis.apiKey, '[REDACTED]') })
      } catch (error) { log({ captureError: error.message }) }
    })
    await page.goto(BASE+'/settings', { waitUntil: 'networkidle0' })
    await page.evaluate(settings => localStorage.setItem('amazon-workbench.api-settings.v1', JSON.stringify(settings)), settings)
    const suiteFile = path.join(OUT, 'saved-suites.json')
    if(fs.existsSync(suiteFile)) await page.evaluate(suites => {
      if(!localStorage.getItem('amazon-workbench.suites')) localStorage.setItem('amazon-workbench.suites', JSON.stringify(suites))
    }, JSON.parse(fs.readFileSync(suiteFile,'utf8')))
    log({ phase, provider: settings.analysis.endpoint, analysisModel: settings.analysis.model, imageModel: settings.image.model })
    if (phase === 'workbench') {
      const references = fs.readdirSync(path.join(ROOT, '视觉工作台测试/竞品图')).filter(x => /\.jpg$/i.test(x)).sort((a,b) => a.localeCompare(b, 'zh', { numeric: true }))
      await page.evaluate(names => {
        localStorage.removeItem('amazon-workbench.generateQueue')
        localStorage.setItem('amazon-workbench.draft.workbench', JSON.stringify({ cards: names.map((name,i) => ({ id:'real-wb-'+i, references:[], extraNeeds: name.startsWith('a+') ? '制作 Amazon A+ 横幅，借鉴参考图的信息布局，产品事实以图1为准。' : '借鉴参考图的构图、展示方式与场景，产品事实以图1为准；不编造尺寸或性能。', prompt:'', analysis:'', size: name.startsWith('a+') ? '2048x1152' : '1024x1024', customSize:'', quality:'auto', outputFormat:'png', background:'auto', count:'1' })) }))
      }, references)
      await page.goto(BASE+'/', { waitUntil: 'networkidle0' })
      await (await page.$('input[type="file"]')).uploadFile(path.join(ROOT, '视觉工作台测试/产品图/产品图.jpg'))
      await page.waitForSelector('img[alt="我方产品图"]')
      const cards = await page.$$('[data-slot="card"]')
      const requests = []
      for (const card of cards) if (await card.$('textarea[placeholder^="点击「生成提示词」"]')) requests.push(card)
      assert.equal(requests.length, references.length)
      for (let i=0;i<requests.length;i++) {
        await (await requests[i].$('input[type="file"]')).uploadFile(path.join(ROOT, '视觉工作台测试/竞品图', references[i]))
        await requests[i].waitForSelector('img[alt^="参考图"]')
      }
      const savedSuites = await page.evaluate(() => JSON.parse(localStorage.getItem('amazon-workbench.suites') || '[]'))
      const prior = savedSuites.find(x => x.name.startsWith('三项实测-友情礼品'))
      if (process.argv.includes('--reuse-prompts')) {
        assert.ok(prior, 'Existing suite required to avoid repeat paid analysis')
        const repairFile = path.join(OUT, 'workbench-grounding-retest-1.json')
        if(fs.existsSync(repairFile)) {
          const output = JSON.parse(fs.readFileSync(repairFile,'utf8')).prompt
          const match = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(output)
          prior.entries[0].prompt = match ? match[1].trim() : output
        }
        await page.$$eval('textarea[placeholder^="点击「生成提示词」"]', (fields,prompts) => fields.forEach((el,i)=>{
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,prompts[i])
          el.dispatchEvent(new Event('input',{bubbles:true}))
        }), prior.entries.map(x=>x.prompt))
      }
      for (let i=0;!process.argv.includes('--reuse-prompts')&&i<requests.length;i+=2) {
        for (const card of requests.slice(i,i+2)) await card.evaluate(el => [...el.querySelectorAll('button')].find(x => x.textContent.trim() === '生成提示词').click())
        const count = Math.min(i+2, requests.length)
        await page.waitForFunction(count => [...document.querySelectorAll('textarea[placeholder^="点击「生成提示词」"]')].slice(0,count).every(x => x.value.length > 100), {timeout:1200000}, count)
        log({ phase, completePrompts: count, total: requests.length })
      }
      const suite = await saveSuite(page, '三项实测-友情礼品-'+new Date().toISOString().slice(0,10))
      assert.equal(suite.entries.length, references.length)
      if(process.argv.includes('--reuse-prompts')) {
        await sleep(1500)
        await page.reload({waitUntil:'networkidle0'})
        await page.waitForFunction(n=>document.querySelectorAll('img[alt^="参考图"]').length===n,{},references.length)
        assert.equal(await page.$eval('img[alt="我方产品图"]',el=>!!el.getAttribute('src')),true)
        log({phase, refreshedAllInputImages:true})
      }
      fs.writeFileSync(path.join(OUT, 'workbench-reference-map.json'), JSON.stringify(references, null, 2))
    } else if (phase === 'remix') {
      const resumeAnalysis=process.argv.includes('--resume-analysis')||process.argv.includes('--completed-analysis')
      if(resumeAnalysis) {
        const suite=JSON.parse(fs.readFileSync(path.join(OUT,'saved-suites.json'),'utf8')).find(x=>x.name.startsWith('三项实测-友情礼品'))
        const finished=[]
        const files=fs.readdirSync(OUT).filter(name=>/^remix-analysis-\d+\.json$/.test(name))
        for(const file of files){
          const record=JSON.parse(fs.readFileSync(path.join(OUT,file),'utf8'))
          if(!record.prompt)continue
          const indices=suite.entries.flatMap((entry,index)=>record.userText.includes(entry.prompt.trim())?[index]:[])
          const parsed=parseRemixRewrite(record.prompt,indices.length)
          indices.forEach((index,slot)=>{finished[index]=parsed[slot]})
        }
        if(process.argv.includes('--completed-analysis'))assert.equal(finished.filter(Boolean).length,suite.entries.length,'All real model results required')
        const product='data:image/jpeg;base64,'+fs.readFileSync(path.join(ROOT,'提示词迁移/7.jpg')).toString('base64')
        await page.evaluate(({suite,finished,product,complete})=>localStorage.setItem('amazon-workbench.remixDraft',JSON.stringify({entries:suite.entries.map((entry,i)=>({...entry,prompt:finished[i]||entry.prompt,enabled:complete||!finished[i],quality:'2k',count:'1'})),productImageDataUrl:product,productImageName:'7.jpg'})),{suite,finished,product,complete:process.argv.includes('--completed-analysis')})
      }
      await page.goto(BASE+'/remix', {waitUntil:'networkidle0'})
      if(!resumeAnalysis) await (await page.$('input[type="file"]')).uploadFile(path.join(ROOT, '提示词迁移/7.jpg'))
      await page.waitForSelector('img[alt="新产品图"]')
      const suites = await page.evaluate(() => JSON.parse(localStorage.getItem('amazon-workbench.suites')))
      const suite = suites.find(x => x.name.startsWith('三项实测-友情礼品'))
      assert.ok(suite)
      if(!resumeAnalysis) {
        await page.select('select', suite.id)
        await click(page, '载入提示词')
      }
      await page.waitForFunction(n => document.querySelectorAll('textarea[placeholder^="提示词内容"]').length===n, {}, suite.entries.length)
      if(!resumeAnalysis) assert.deepEqual(await readEntries(page, 'textarea[placeholder^="提示词内容"]'), suite.entries.map(x=>x.prompt))
      if(!process.argv.includes('--completed-analysis')){
        await click(page, 'AI 改写全部')
        await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(x => x.textContent.includes('改写中')), {timeout:1200000})
      }
      const prompts = await readEntries(page, 'textarea[placeholder^="提示词内容"]')
      assert.equal(prompts.length, suite.entries.length)
      assert.ok(prompts.every((x,i)=>x!==suite.entries[i].prompt), 'Every source prompt must be rewritten')
      if(process.argv.includes('--resume-analysis')) await page.evaluate(()=>[...document.querySelectorAll('button')].filter(x=>x.textContent.trim()==='停用').forEach(x=>x.click()))
      fs.writeFileSync(path.join(OUT, 'remix-prompts.json'), JSON.stringify(prompts, null, 2))
    } else if (phase === 'planner') {
      await page.goto(BASE+'/planner', {waitUntil:'networkidle0'})
      await (await page.$('input[accept*="image/png"]')).uploadFile(path.join(ROOT, '一键策划测试/1.jpg'))
      await page.waitForSelector('img')
      await (await page.$('input[accept=".docx,.xlsx,.csv,.txt"]')).uploadFile(path.join(ROOT, '一键策划测试/cos服装图片策划 副本.xlsx'))
      await page.waitForFunction(() => document.body.innerText.includes('12 张内嵌图片'), {timeout:60000})
      const testDimensions = '【本轮测试专用数据】用户明确授权编写虚拟尺寸，仅用于验证标注功能，不能当作实测参数。头箍宽15cm、高20cm，1 Stück；眼镜宽14.5cm、高7.5cm，1 Stück；耳环长5cm，1 Paar；网眼手套长30cm，1 Paar；裙长40cm，松紧腰围60–90cm，1 Stück；长袜长55cm，1 Paar；草莓包宽18cm、高22cm、厚6cm，1 Stück。仅在尺寸版位使用这些示例值；该图必须清楚标注德语“Beispielmaße – nur für Test, nicht gemessen”，其他图不要当成真实尺寸卖点使用。不要为匹配示例标尺改变真实商品外观。'
      await page.$eval('textarea[placeholder^="也可直接粘贴"]',(el,value)=>{
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value)
        el.dispatchEvent(new Event('input',{bubbles:true}))
      },testDimensions)
      await page.screenshot({path:path.join(OUT,'planner-input.png'),fullPage:true})
      await click(page, '开始策划')
      await page.waitForFunction(() => [...document.querySelectorAll('textarea[placeholder^="提示词内容"]')].some(x=>x.value.length>100), {timeout:1200000})
      await saveSuite(page, '三项实测-草莓策划-'+new Date().toISOString().slice(0,10))
    } else if (phase === 'generate') {
      await page.goto(BASE+'/generate', {waitUntil:'networkidle0'})
      const start = Date.now()
      let last=''
      while(Date.now()-start<3*60*60*1000) {
        const tasks = await page.evaluate(() => JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]'))
        const state = tasks.map(x=>x.status).join(',')
        if(state!==last) {log({phase, states:state});last=state}
        if(tasks.length && tasks.every(x=>!['queued','running'].includes(x.status))) break
        await sleep(5000)
      }
    } else throw new Error('Unknown phase')
    await sleep(1000)
    await page.screenshot({path:path.join(OUT,phase+'-page.png'),fullPage:true})
    const drafts = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k=>/draft|Draft|suites$/.test(k)).map(k=>[k, JSON.parse(localStorage.getItem(k))])))
    fs.writeFileSync(path.join(OUT, phase+'-state.json'), JSON.stringify(drafts,null,2))
    if (['workbench','remix','planner'].includes(phase) && process.argv.includes('--enqueue')) {
      const label = await page.evaluate(() => [...document.querySelectorAll('button')].find(x=>/生图全部|全部生图|开始生成|生成 \d+ 条/.test(x.textContent) && !x.disabled)?.textContent.trim())
      await click(page, label)
      await page.waitForFunction(()=>location.pathname==='/generate', {timeout:10000})
      const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')))
      fs.writeFileSync(path.join(OUT, phase+'-queue.json'), JSON.stringify(queue,null,2))
      log({phase, queued:queue.length})
      // Wait for real image responses and save immediately, so progress survives interruption.
      let saved = new Set()
      page.on('response', async response => {
        if(!response.url().endsWith('/api/images')) return
        const data=await response.json().catch(()=>({}))
        log({phase,imageResponse:response.status(),images:data.images?.length,error:data.error})
      })
      for(let i=0;i<2160;i++) {
        const tasks = await page.evaluate(async () => {
          const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]')
          const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('amazon-workbench-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('task-results');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
          try {for(const task of tasks) if(task.status==='success'&&!task.resultUrls.length)task.resultUrls=await new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get(task.id);r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>resolve([])})}finally{db.close()}
          return tasks
        })
        for(let j=0;j<tasks.length;j++) {
          const task=tasks[j]
          if(task.status==='success'&&!saved.has(task.id)) {
            for(let k=0;k<task.resultUrls.length;k++) {
              const src=task.resultUrls[k]
              if(!src.startsWith('data:')) throw new Error('Remote result requires explicit download: '+task.id)
              fs.writeFileSync(path.join(OUT,`${phase}-${String(j+1).padStart(2,'0')}-${k+1}.png`),Buffer.from(src.split(',')[1],'base64'))
            }
            saved.add(task.id);log({phase, saved:saved.size, total:tasks.length})
          }
        }
        fs.writeFileSync(path.join(OUT,phase+'-results.json'),JSON.stringify(tasks.map(({productImageDataUrl,references,resultUrls,...task})=>({...task,imageCount:resultUrls.length})),null,2))
        if(tasks.some(x=>x.status==='interrupted') || tasks.length&&tasks.every(x=>!['running','queued'].includes(x.status)))break
        await sleep(5000)
      }
      await page.screenshot({path:path.join(OUT,phase+'-results.png'),fullPage:true})
    }
    log({phase,done:true})
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error.message.replaceAll(settings.analysis.apiKey,'[REDACTED]').replaceAll(settings.image.apiKey,'[REDACTED]'));process.exitCode=1})
