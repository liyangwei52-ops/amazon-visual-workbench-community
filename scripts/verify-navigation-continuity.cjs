const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3014',OUT=path.resolve('verification/navigation-continuity'),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(test){const end=Date.now()+15000;while(!test()){if(Date.now()>end)throw new Error('Request count timeout');await delay(25)}}
async function main(){
 fs.mkdirSync(OUT,{recursive:true});const fixture='data:image/png;base64,'+(await sharp({create:{width:128,height:128,channels:3,background:'#aaccdd'}}).png().toBuffer()).toString('base64')
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-background-timer-throttling']})
 try{
  const context=await browser.createBrowserContext(),page=await context.newPage(),analyses=[],images=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});await page.setRequestInterception(true)
  page.on('request',request=>{
   const route=new URL(request.url()).pathname
   if(route==='/api/provider-transport')return void request.respond({status:200,contentType:'application/json',body:JSON.stringify({mode:'proxy',baseURL:'https://api.openlux.ai/v1'})})
   if(route==='/api/analyze'){analyses.push({request,body:JSON.parse(request.postData())});return}
   if(route==='/api/images'){images.push(request);return}
   if(request.url().startsWith('https://api.openlux.ai/'))throw new Error('Real provider forbidden')
   void request.continue()
  })
  const click=label=>page.evaluate(label=>{const el=[...document.querySelectorAll('button')].find(x=>(x.textContent.trim()===label||(label==='生成提示词'&&/^生成提示词 \d+ 条$/.test(x.textContent.trim())))&&x.getBoundingClientRect().width>0);if(!el||el.disabled)throw new Error('Missing/disabled '+label);el.click()},label)
  const nav=async href=>{await page.evaluate(href=>{const el=[...document.querySelectorAll('aside a[href]')].find(x=>x.getAttribute('href')===href&&x.getBoundingClientRect().width>0);if(!el)throw new Error('No visible navigation to '+href);el.click()},href);await page.waitForFunction(href=>location.pathname===href,{},href)}
  const waitStates=states=>page.waitForFunction(states=>{const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]');return Object.entries(states).every(([status,count])=>tasks.filter(x=>x.status===status).length===count)}, {},states)
  const respond=async(request,payload,status=200)=>request.respond({status,contentType:'application/json',body:JSON.stringify(payload)})
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  await page.evaluate(fixture=>{
   const config={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-navigation-only',model:'mock-analysis'}
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:config,image:{...config,model:'gpt-image-2'}}));localStorage.setItem('amazon-workbench.profile.v1',JSON.stringify({autoArchive:false}))
   localStorage.setItem('amazon-workbench.draft.workbench',JSON.stringify({productImages:[{id:'product',name:'product.png',dataUrl:fixture}],cards:[{id:'empty',enabled:true,extraNeeds:'',references:[],prompt:''},{id:'needs',enabled:false,extraNeeds:'NAV_NEEDS',references:[],prompt:'需求原文'},{id:'reference',enabled:false,extraNeeds:'',references:[{id:'ref',name:'ref.png',dataUrl:fixture}],prompt:'参考原文'}]}))
   localStorage.setItem('amazon-workbench.draft.simple',JSON.stringify({generationMode:'image',productImages:[{id:'product',name:'product.png',dataUrl:fixture}],entries:[{id:'new-batch',enabled:true,prompt:'第二批完整提示词',ratio:'1:1',quality:'1k',count:'1'}]}))
  },fixture)
  await page.goto(BASE+'/',{waitUntil:'networkidle0'});await page.waitForSelector('img[alt="我方产品图"]');await page.waitForSelector('img[alt="参考图 1"]')
  assert.deepEqual(await page.$$eval('input[aria-label^="选择请求"]',xs=>xs.map(x=>x.checked)),[false,false,false]);assert.equal(analyses.length,0)
  assert.ok(await page.$$eval('input[aria-label^="选择请求"]',xs=>xs.every(x=>x.parentElement.textContent.trim()==='启用')))
  await click('新增请求');assert.equal(await page.$eval('[aria-label="选择请求 4"]',x=>x.checked),false)
  await page.click('[aria-label="选择请求 1"]');assert.ok(await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/^生成提示词 \d+ 条$/.test(x.textContent.trim())).disabled));await page.click('[aria-label="选择请求 1"]')
  await page.click('[aria-label="选择请求 2"]');await page.click('[aria-label="选择请求 3"]');await click('生成提示词');await until(()=>analyses.length===2)
  assert.ok(analyses.some(x=>x.body.images.length===1&&x.body.userText.includes('NAV_NEEDS')));assert.ok(analyses.some(x=>x.body.images.length===2));assert.equal(analyses.length,2)
  await page.evaluate(()=>window.navigationContinuityToken='same-document');await nav('/settings');await page.waitForFunction(()=>document.querySelector('[data-running-notice]')?.innerText.includes('提示词分析 2 路'))
  const textRequest=analyses.find(x=>x.body.userText.includes('NAV_NEEDS')),refRequest=analyses.find(x=>x!==textRequest)
  await respond(textRequest.request,{prompt:'【正向 Prompt】需求分析返回的完整提示词\n【负向 Prompt】禁止变形'});await page.waitForFunction(()=>document.querySelector('[data-running-notice]')?.innerText.includes('提示词分析 1 路'))
  await page.screenshot({path:OUT+'/analysis-on-settings.png',fullPage:true});await nav('/');assert.equal(await page.evaluate(()=>window.navigationContinuityToken),'same-document')
  assert.equal(analyses.length,2);assert.ok(await page.$eval('[data-request-card="needs"] [data-prompt-preview]',x=>x.value.includes('需求分析返回')));assert.ok(await page.$eval('[aria-label="选择请求 3"]',x=>x.disabled))
  await respond(refRequest.request,{error:'模拟返回失败'},500);await page.waitForFunction(()=>!document.querySelector('[aria-label="选择请求 3"]').disabled);assert.equal(await page.$eval('[data-request-card="reference"] [data-prompt-preview]',x=>x.value),'参考原文')
  await delay(700);await page.reload({waitUntil:'networkidle0'});assert.ok(await page.$eval('[data-request-card="needs"] [data-prompt-preview]',x=>x.value.includes('需求分析返回')));assert.equal(analyses.length,2)
  await click('生成 2 条');await page.waitForFunction(()=>location.pathname==='/generate');await until(()=>images.length===2);await waitStates({running:2})
  await nav('/planner');await page.waitForFunction(()=>document.querySelector('[data-running-notice]')?.innerText.includes('生图 2 个任务'))
  await respond(images[1],{images:[{src:fixture}]});await waitStates({success:1,running:1});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')).filter(x=>x.status==='interrupted').length),0)
  await page.screenshot({path:OUT+'/images-on-planner.png',fullPage:true});await nav('/generate');await waitStates({success:1,running:1});assert.equal(images.length,2);await respond(images[0],{images:[{src:fixture}]});await waitStates({success:2})
  await nav('/simple');await page.waitForFunction(()=>[...document.querySelectorAll('[data-prompt-preview]')].some(x=>x.value==='第二批完整提示词'));await click('生成 1 条');await page.waitForFunction(()=>location.pathname==='/generate');await until(()=>images.length===3);await waitStates({running:1})
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')).map(x=>x.id)),['new-batch']);assert.ok(await page.evaluate(()=>[...document.querySelectorAll('[data-persistent-generate] a')].some(x=>x.innerText.includes('返回极简图文生图'))))
  await page.reload({waitUntil:'networkidle0'});await waitStates({interrupted:1});await delay(200);assert.equal(images.length,3,'刷新不能自动重复调用');assert.deepEqual(errors,[])
  fs.writeFileSync(OUT+'/result.json',JSON.stringify({baseURL:BASE,blankAndNewDefaultOff:true,needsOrReferenceAccepted:true,emptyAnalysisCalls:0,analysisNavigatesAndReturns:true,failedAnalysisKeepsOriginal:true,imagesContinueOnNavigation:true,newBatchOnRetainedPanel:true,refreshRequiresConfirmation:true,duplicateRequests:0,paidCalls:0},null,2));console.log('PASS: 默认关闭与空卡过滤；需求/参考图任一可分析；真实侧栏切换时继续分析与生图；结果回填保存；失败保留；常驻面板接新批次；刷新待确认；模拟零费用')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
