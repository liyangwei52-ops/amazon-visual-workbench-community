const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3027',OUT=path.resolve('verification/custom-ratio'),delay=ms=>new Promise(r=>setTimeout(r,ms))
async function main(){
 fs.mkdirSync(OUT,{recursive:true})
 const fixture='data:image/png;base64,'+(await sharp({create:{width:100,height:100,channels:3,background:'#cddabb'}}).png().toBuffer()).toString('base64')
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']}),reports=[]
 try{
  for(const [route,model] of [['/','gpt-image-2'],['/planner','gpt-image-2'],['/remix','gpt-image-2'],['/simple','gpt-image-2'],['/simple','gemini-3-pro-image']]){
   console.log('Scenario',route,model)
   const context=await browser.createBrowserContext(),page=await context.newPage(),requests=[],errors=[]
   page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1366,height:1000})
   await page.evaluateOnNewDocument(()=>{const original=window.fetch;window.fetch=(url,init)=>{if(String(url)==='/api/images'&&init?.body instanceof FormData){const form=init.body,headers=new Headers(init.headers);headers.set('x-ratio-trace',encodeURIComponent(JSON.stringify(Object.fromEntries(['size','requestedSize','qualityLevel','ratio','imageCount','prompt'].map(key=>[key,form.get(key)])))));return original.call(window,url,{...init,headers})}return original.call(window,url,init)}})
   await page.setRequestInterception(true);page.on('request',request=>{
    const pathname=new URL(request.url()).pathname,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,x-ratio-trace'}
    if(pathname==='/api/provider-transport')return void request.respond({status:200,contentType:'application/json',body:JSON.stringify({mode:model.startsWith('gemini')?'direct':'proxy',baseURL:'https://api.openlux.ai/v1'})})
    if(pathname==='/api/images'){const trace=JSON.parse(decodeURIComponent(request.headers()['x-ratio-trace']));requests.push(trace);return void request.respond({status:200,contentType:'application/json',body:JSON.stringify({images:[{src:fixture}]})})}
    if(request.url().startsWith('https://api.openlux.ai/')){
     if(request.method()==='OPTIONS')return void request.respond({status:204,headers})
     assert.ok(pathname.includes(':generateContent'),'Unexpected unmocked provider call');const body=JSON.parse(request.postData());requests.push({config:body.generationConfig.imageConfig,prompt:body.contents[0].parts[0].text});return void request.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:fixture.split(',')[1]}}]}}]})})
    }
    if(pathname==='/api/analyze')return void request.respond({status:400,contentType:'application/json',body:JSON.stringify({error:'Analysis forbidden in this test'})})
    void request.continue()
   })
   await page.goto(BASE+'/settings',{waitUntil:'networkidle0'});await page.evaluate(({route,model,fixture})=>{
    const config={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-ratio-only',model};localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:config,image:config}));localStorage.setItem('amazon-workbench.profile.v1',JSON.stringify({autoArchive:false}))
    const entries=['5:4','1:3'].map((customSize,index)=>({id:'ratio-'+index,enabled:true,size:'custom',ratio:'custom',customSize,quality:'2k',count:'1',prompt:'完整商品要求，旧画布横向16:9构图；产品尺寸12×80cm。',title:'版位'+index,sizeUserSet:true,references:[],extraNeeds:'展示商品'}))
    const key=route==='/'?'amazon-workbench.draft.workbench':route==='/remix'?'amazon-workbench.remixDraft':'amazon-workbench.draft.'+(route==='/planner'?'planner':'simple');localStorage.setItem(key,JSON.stringify({productImages:[{id:'p',name:'p.png',dataUrl:fixture}],...(route==='/'?{cards:entries}:{entries}),generationMode:'image'}))
   },{route,model,fixture})
   await page.goto(BASE+route,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelectorAll('[data-generation-settings]').length===2)
   const prefix=route==='/'?'请求 1':'提示词 1',field=`[aria-label="${prefix} 的自定义比例"]`
   assert.equal(await page.$eval(field,x=>x.value),'5:4');assert.ok(await page.evaluate(()=>!document.body.innerText.includes('自定义尺寸（宽')))
   const fill=async(selector,value)=>{await page.focus(selector);await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.type(value)}
   const click=label=>page.evaluate(label=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label&&x.getBoundingClientRect().width>0);if(!b||b.disabled)throw Error('Button missing '+label);b.click()},label)
   const choose=async value=>{const element=(await page.evaluateHandle(value=>[...document.querySelectorAll('[role="option"]')].find(x=>x.getBoundingClientRect().width>0&&x.textContent.replace(/[▼✓]/g,'').trim()===value),value)).asElement();if(!element)throw Error('Missing option '+value);await element.click();await page.waitForFunction(()=>![...document.querySelectorAll('[role="option"]')].some(x=>x.getBoundingClientRect().width>0))}
   const generate=()=>page.$eval('[data-batch-generation] button',b=>b.click())
   await fill(field,'0:3');await generate();await delay(200);assert.equal(requests.length,0);assert.equal(new URL(page.url()).pathname,route)
   await fill(field,'5:4');await page.waitForFunction(()=>document.querySelector('[data-size-hint]')?.innerText.includes('2560x2048')||document.querySelector('[data-size-hint]')?.innerText.includes('2304x1856'))
   await page.focus(`[aria-label="${prefix} 的清晰度"]`);await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>[...document.querySelectorAll('[role="option"]')].some(x=>x.getBoundingClientRect().width>0&&x.textContent.trim()==='1K'));await choose('1K');await page.waitForFunction(()=>document.querySelector('[data-size-hint]')?.innerText.includes('1280x1024')||document.querySelector('[data-size-hint]')?.innerText.includes('1152x928'))
   await page.focus(`[aria-label="${prefix} 的清晰度"]`);await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>[...document.querySelectorAll('[role="option"]')].some(x=>x.getBoundingClientRect().width>0&&x.textContent.trim()==='2K'));await choose('2K')
   if(!model.startsWith('gemini')&&route!=='/remix'){await click('保存为套装');await page.waitForSelector('dialog[open] input');await fill('dialog[open] input','自定义比例套装');await page.$eval('dialog[open] form',form=>form.requestSubmit());await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.suites')||'[]')[0]?.entries[1]?.customSize==='1:3')}
   await delay(700);await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval(field,x=>x.value),'5:4');await page.setViewport({width:390,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:OUT+'/'+(route==='/'?'workbench':route.slice(1))+'-'+model+'.png',fullPage:true});await page.setViewport({width:1366,height:1000})
   await generate();await page.waitForFunction(()=>location.pathname==='/generate');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]').filter(x=>x.status==='success').length===2)
   assert.equal(requests.length,2);if(model.startsWith('gemini')){assert.deepEqual(requests.map(x=>x.config.aspectRatio).sort(),['5:4','9:16']);assert.ok(requests.every(x=>x.config.imageSize==='2K'))}else{assert.equal(requests.find(x=>x.requestedSize==='5:4').size,'2560x2048');assert.equal(requests.find(x=>x.requestedSize==='1:3').size,'1280x3840');assert.ok(requests.every(x=>Number(x.imageCount)===1));assert.ok(requests.every(x=>!x.prompt.includes('16:9')&&x.prompt.includes('12×80cm')))}
   assert.ok(await page.evaluate(()=>document.body.innerText.includes('5:4')&&document.body.innerText.includes('1:3')));assert.deepEqual(errors,[]);reports.push({route,model,ratios:['5:4','1:3'],qualityToggle:true,invalidBlocked:true,refreshPreserved:true,suiteSaved:!model.startsWith('gemini')&&route!=='/remix',requests:2});await context.close()
  }
  {
   const context=await browser.createBrowserContext(),page=await context.newPage();await page.goto(BASE+'/suite',{waitUntil:'networkidle0'});await page.evaluate(()=>localStorage.setItem('amazon-workbench.draft.suite',JSON.stringify({name:'比例编辑',entries:[{id:'custom',size:'custom',customSize:'1:3',prompt:'完整套装提示词'}]})));await page.reload({waitUntil:'networkidle0'});const selector='[aria-label="提示词 1 的自定义比例"]';await page.waitForSelector(selector);await page.focus(selector);await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.type('5:4');await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='仅保存').click());await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.suites')||'[]')[0]?.entries[0]?.customSize==='5:4');await page.goto(BASE+'/simple',{waitUntil:'networkidle0'});await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='载入提示词').click());await page.waitForSelector(selector);assert.equal(await page.$eval(selector,x=>x.value),'5:4');reports.push({suiteEditor:true,simpleLoad:true});await context.close()
  }
  fs.writeFileSync(OUT+'/result.json',JSON.stringify({baseURL:BASE,reports,paidCalls:0},null,2));console.log('PASS: 四入口自定义5:4/1:3、1K/2K切换、无效比例阻止、保存套装/编辑/调用、刷新、手机、GPT出站及Gemini原生适配（全模拟）')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
