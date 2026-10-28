// Isolated browsers, synthetic images and intercepted model calls. Never use real credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3033',OUT=path.resolve('verification/p3-p4-u2'),delay=ms=>new Promise(r=>setTimeout(r,ms))
const QUEUE='amazon-workbench.generateQueue',SETTINGS='amazon-workbench.api-settings.v1'
async function main(){
 fs.mkdirSync(OUT,{recursive:true})
 const fixture='data:image/png;base64,'+(await sharp({create:{width:96,height:96,channels:3,background:'#bed4df'}}).png().toBuffer()).toString('base64')
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-background-timer-throttling']}),reports=[]
 const click=async(page,label)=>page.evaluate(label=>{const b=[...document.querySelectorAll('button')].find(x=>x.getBoundingClientRect().width>0&&x.textContent.trim()===label);if(!b||b.disabled)throw new Error('Missing/disabled '+label);b.click()},label)
 const waitQueue=async(page,test)=>page.waitForFunction(test=>Function('tasks',`return (${test})(tasks)`)(JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]')),{},test.toString())
 async function surface(){
  const context=await browser.createBrowserContext(),page=await context.newPage(),calls=[],analyses=[],errors=[];let hold=false
  page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.setRequestInterception(true)
  page.on('request',r=>{
   if(r.url().endsWith('/api/provider-transport'))return void r.respond({status:200,contentType:'application/json',body:JSON.stringify({mode:'proxy',baseURL:'https://api.openlux.ai/v1'})})
   if(r.url().endsWith('/api/images')){calls.push(r);if(hold)return;return void r.respond({status:200,contentType:'application/json',body:JSON.stringify({images:[{src:fixture}]})})}
   if(r.url().endsWith('/api/analyze')){analyses.push(JSON.parse(r.postData()));return void r.respond({status:200,contentType:'application/json',body:JSON.stringify({prompt:'【提示词 1｜测试】\n【最终 AI 绘图 Prompt】\n```text\n【正向 Prompt】保留真实商品，测试文案“Alles Gute!”。\n【负向 Prompt】禁止变形。\n```'})})}
   if(r.url().includes('/api/')||r.url().startsWith('https://api.openlux.ai/'))return void r.abort()
   void r.continue()
  })
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  return {context,page,calls,analyses,errors,setHold:x=>hold=x}
 }
 async function seed(page,{model='gpt-image-2',queue,route}={}){
  await page.evaluate(({model,queue,route,fixture})=>{
   const c={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-recovery-only',model:'mock-analysis'}
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:c,image:{...c,model}}));localStorage.setItem('amazon-workbench.profile.v1',JSON.stringify({autoArchive:false}))
   if(queue)localStorage.setItem('amazon-workbench.generateQueue',JSON.stringify(queue))
   if(route){const e={id:'ready',enabled:true,prompt:'保留全部商品细节，文案“Alles Gute!”。',extraNeeds:'展示真实商品',references:[],size:'1:1',ratio:'1:1',quality:'1k',count:'1',title:'测试'};const key=route==='/'?'amazon-workbench.draft.workbench':route==='/remix'?'amazon-workbench.remixDraft':'amazon-workbench.draft.'+(route==='/planner'?'planner':'simple');localStorage.setItem(key,JSON.stringify({generationMode:'image',productImages:[{id:'p',name:'product.png',dataUrl:fixture}],...(route==='/'?{cards:[e]}:{entries:[e]})}))}
  },{model,queue,route,fixture})
 }
 const task=(id,status,count=1,urls=[])=>({id,label:id,ratio:'1:1',quality:'1k',count,prompt:'完整商品事实，商品尺寸12×80cm，文案“Alles Gute!”。',status,productImageDataUrl:'',resultUrls:urls})
 try{
  // New user guidance and saved-settings behavior across every entry, including a retained workbench.
  for(const route of ['/','/remix','/planner','/simple']){
   const s=await surface(),{page}=s;await page.goto(BASE+route,{waitUntil:'networkidle0'});await page.waitForSelector('[data-api-setup]')
   assert.ok(await page.$eval('[data-api-setup]',(x,route)=>x.textContent.includes(route==='/simple'?'生图配置':'分析、生图配置'),route))
   assert.ok(await page.$$eval('[data-batch-generation] button',xs=>xs.every(x=>x.disabled)))
   await page.setViewport({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:OUT+'/setup-'+(route==='/'?'home':route.slice(1))+'-mobile.png',fullPage:true})
   await seed(page,{route});await page.goto(BASE+route,{waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.querySelector('[data-api-setup]'));assert.ok(await page.$('[data-image-model="gpt"]'))
   assert.equal(s.calls.length+s.analyses.length,0);assert.deepEqual(s.errors,[]);reports.push({route,setupNotice:true,missingKeyDisabled:true,savedConfigHidesNotice:true,mobileNoOverflow:true});await s.context.close()
  }
  const sw=await surface();await seed(sw.page,{route:'/'});await sw.page.goto(BASE+'/',{waitUntil:'networkidle0'});await sw.page.evaluate(()=>window.samePageToken='persisted')
  await sw.page.evaluate(()=>[...document.querySelectorAll('aside a[href="/settings"]')].find(x=>x.getBoundingClientRect().width).click());await sw.page.waitForSelector('#image-model')
  await sw.page.click('#image-model');await sw.page.keyboard.down('Control');await sw.page.keyboard.press('A');await sw.page.keyboard.up('Control');await sw.page.type('#image-model','gemini-3-pro-image-preview')
  await sw.page.waitForSelector('form [data-image-model="gemini"]');assert.ok(await sw.page.$eval('form [data-image-model]',x=>x.textContent.includes('待保存')))
  assert.equal(await sw.page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.api-settings.v1')).image.model),'gpt-image-2')
  await click(sw.page,'保存设置');await sw.page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.api-settings.v1')).image.model==='gemini-3-pro-image-preview')
  await sw.page.evaluate(()=>[...document.querySelectorAll('aside a[href="/"]')].find(x=>x.getBoundingClientRect().width).click());await sw.page.waitForFunction(()=>location.pathname==='/')
  assert.equal(await sw.page.evaluate(()=>window.samePageToken),'persisted');await sw.page.waitForSelector('[data-persistent-workbench] [data-image-model="gemini"]')
  assert.equal(await sw.page.$eval('[data-request-card="ready"] [data-prompt-preview]',x=>x.value),'保留全部商品细节，文案“Alles Gute!”。')
  await click(sw.page,'生成提示词 1 条');await sw.page.waitForFunction(()=>!document.querySelector('[aria-label="选择请求 1"]').disabled)
  assert.equal(sw.analyses.length,1);assert.ok(sw.analyses[0].systemPrompt.includes('【目标生图模型｜Gemini Image】'));assert.ok(!sw.analyses[0].systemPrompt.includes('GPT Image 商品图提示词工程师'))
  assert.deepEqual(sw.errors,[]);reports.push({savedModelSwitchImmediate:true,unsavedDoesNotApply:true,customPromptPreserved:true,analysisTargetsImageModel:true});await sw.context.close()
  for(const [route,label]of [['/planner','开始策划'],['/remix','AI 改写 1 条']]){
   const s=await surface();await seed(s.page,{route,model:'gemini-3-pro-image'});await s.page.goto(BASE+route,{waitUntil:'networkidle0'})
   // Titles vary only by page; inspect the actual current UI label.
   const button=await s.page.evaluate(route=>[...document.querySelectorAll('button')].filter(x=>x.getBoundingClientRect().width&&!x.disabled).find(x=>route==='/planner'?x.textContent.trim()==='开始策划':/改写.*1.*条/.test(x.textContent))?.textContent.trim(),route)
   assert.ok(button,`missing analysis button ${route} (${label})`);await click(s.page,button);await s.page.waitForFunction(()=>!document.querySelector('[data-request-wait]'))
   assert.equal(s.analyses.length,1);assert.ok(s.analyses[0].systemPrompt.includes('【目标生图模型｜Gemini Image】'));assert.deepEqual(s.errors,[]);reports.push({route,analysisSuffix:true});await s.context.close()
  }
  // Refresh with a queued, uncertain and old partial task: only explicit Continue sends queued work.
  const q=await surface();await seed(q.page,{queue:[task('uncertain','interrupted',2,[fixture]),task('not-sent','queued'),task('partial','success',2,[fixture])]});await q.page.goto(BASE+'/generate',{waitUntil:'networkidle0'});await q.page.waitForSelector('[data-queue-recovery]');assert.equal(q.calls.length,0)
  assert.ok(await q.page.$eval('[data-queue-recovery]',x=>x.textContent.includes('尚未发送 1 条，待确认 1 条，部分返回 1 条')))
  await q.page.screenshot({path:OUT+'/recovery-desktop.png',fullPage:true});await q.page.click('[data-continue-queue]');await waitQueue(q.page,ts=>ts.find(x=>x.id==='not-sent')?.status==='success');assert.equal(q.calls.length,1)
  let saved=await q.page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')));assert.equal(saved[0].status,'interrupted');assert.equal(saved[0].resultCount,1);assert.equal(saved[2].resultCount,1)
  q.page.once('dialog',d=>void d.dismiss());await q.page.$eval('[data-generation-task="uncertain"] button',()=>{});await q.page.evaluate(()=>[...document.querySelector('[data-generation-task="uncertain"]').querySelectorAll('button')].find(x=>x.textContent.includes('补生成')).click());await delay(100);assert.equal(q.calls.length,1)
  q.page.once('dialog',d=>void d.accept());await q.page.evaluate(()=>[...document.querySelector('[data-generation-task="uncertain"]').querySelectorAll('button')].find(x=>x.textContent.includes('补生成')).click());await waitQueue(q.page,ts=>ts[0].status==='success');assert.equal(q.calls.length,2)
  await q.page.reload({waitUntil:'networkidle0'});assert.equal(q.calls.length,2);assert.ok(await q.page.$('[data-queue-recovery]'));await q.page.evaluate(()=>[...document.querySelector('[data-generation-task="partial"]').querySelectorAll('button')].find(x=>x.textContent.includes('补生成')).click());await waitQueue(q.page,ts=>ts.every(x=>x.status==='success'));assert.equal(q.calls.length,3)
  assert.deepEqual(q.errors,[]);reports.push({recoveryCounts:true,continueQueuedOnly:true,unknownRequiresConfirmation:true,cancelSendsNothing:true,missingOnly:true,retainsImages:true,refreshNoResubmit:true});await q.context.close()
  // Real refresh after first result checkpoint, while the second single-image request is pending.
  const r=await surface();await seed(r.page,{route:'/simple'});await r.page.evaluate(()=>{const k='amazon-workbench.draft.simple',d=JSON.parse(localStorage.getItem(k));d.entries[0].count='2';localStorage.setItem(k,JSON.stringify(d))});r.setHold(true)
  await r.page.goto(BASE+'/simple',{waitUntil:'networkidle0'});await click(r.page,'生成 1 条');await r.page.waitForFunction(()=>location.pathname==='/generate');while(r.calls.length<2)await delay(30)
  await r.calls[0].respond({status:200,contentType:'application/json',body:JSON.stringify({images:[{src:fixture}]})});await waitQueue(r.page,ts=>ts[0]?.resultCount===1);await r.page.reload({waitUntil:'networkidle0'});await r.page.waitForSelector('[data-queue-recovery]');assert.equal(r.calls.length,2);await waitQueue(r.page,ts=>ts[0]?.status==='interrupted'&&ts[0]?.resultCount===1)
  await r.page.setViewport({width:390,height:844});assert.ok(await r.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await r.page.screenshot({path:OUT+'/recovery-mobile.png',fullPage:true});assert.deepEqual(r.errors,[]);reports.push({freshClickStartsAutomatically:true,perImageIndependent:true,refreshRestoresCheckpoint:true,refreshNeverReposts:true});await r.context.close()
  const stale=await surface();await seed(stale.page,{queue:[task('stale-running','running'),task('stale-queued','queued')]});await stale.page.evaluate(()=>localStorage.setItem('amazon-workbench.queueLock',JSON.stringify({owner:'crashed-test-tab',at:Date.now()})))
  await stale.page.goto(BASE+'/generate',{waitUntil:'networkidle0'});await stale.page.evaluate(()=>{const now=Date.now.bind(Date);Date.now=()=>now()+35000});await stale.page.waitForSelector('[data-queue-recovery]',{timeout:15000});assert.equal(stale.calls.length,0);assert.deepEqual(stale.errors,[]);reports.push({expiredLeaseRecoversWithoutSending:true});await stale.context.close()
  fs.writeFileSync(OUT+'/result.json',JSON.stringify({baseURL:BASE,reports,paidCalls:0},null,2));console.log('PASS: 四入口API引导、同页保存模型、三入口分析适配、完整提示词保留、继续仅排队、核查确认、部分补图、刷新恢复检查点及过期锁（全模拟）')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
