const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3015',OUT=path.resolve('verification/unified-generation'),delay=ms=>new Promise(r=>setTimeout(r,ms))
async function main(){
 fs.mkdirSync(OUT,{recursive:true});const image='data:image/png;base64,'+(await sharp({create:{width:128,height:128,channels:3,background:'#ccddaa'}}).png().toBuffer()).toString('base64')
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});const reports=[]
 try{
  for(const route of ['/','/planner','/remix','/simple']){
   console.log('Scenario',route);const context=await browser.createBrowserContext(),page=await context.newPage(),requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100})
   await page.evaluateOnNewDocument(()=>{const original=window.fetch;window.fetch=(url,init)=>{if(String(url)==='/api/images'&&init?.body instanceof FormData){const headers=new Headers(init.headers);headers.set('x-mock-plan',JSON.stringify(Object.fromEntries(['size','requestedSize','qualityLevel','ratio','imageCount'].map(key=>[key,init.body.get(key)]))));return original.call(window,url,{...init,headers})}return original.call(window,url,init)}})
   await page.setRequestInterception(true);page.on('request',request=>{
    const pathname=new URL(request.url()).pathname
    if(pathname==='/api/provider-transport')return void request.respond({status:200,contentType:'application/json',body:JSON.stringify({mode:'proxy',baseURL:'https://api.openlux.ai/v1'})})
    if(pathname==='/api/images'){const plan=JSON.parse(request.headers()['x-mock-plan']);requests.push(plan);return void request.respond({status:200,contentType:'application/json',body:JSON.stringify({images:Array.from({length:Number(plan.imageCount)},()=>({src:image}))})})}
    if(pathname==='/api/analyze'||request.url().startsWith('https://api.openlux.ai/'))throw new Error('Unexpected paid API')
    void request.continue()
   })
   await page.goto(BASE+'/settings',{waitUntil:'networkidle0'});await page.evaluate(({route,image})=>{
    const config={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-unified-only',model:'gpt-image-2'};localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:config,image:config}));localStorage.setItem('amazon-workbench.profile.v1',JSON.stringify({autoArchive:false}))
    const productImages=[{id:'product',name:'product.png',dataUrl:image}],entries=[{id:'first',enabled:true,size:'16:9',ratio:'16:9',quality:'2k',count:'2',customSize:'',prompt:'完整提示词第一条',title:'版位1'},{id:'second',enabled:false,size:'custom',ratio:'custom',quality:'2k',count:'4',customSize:'1280x720',prompt:'完整提示词第二条',title:'版位2'},{id:'third',enabled:true,size:'21:9',ratio:'21:9',quality:'1k',count:'1',customSize:'',prompt:'完整提示词第三条',title:'版位3'}]
    if(route==='/'){localStorage.setItem('amazon-workbench.draft.workbench',JSON.stringify({productImages,cards:entries.map((entry,index)=>({...entry,size:index===0?'2048x1152':index===2?'3840x2160':'custom',quality:'auto',references:[],extraNeeds:'画面需求'+index}))}))}
    else {const key=route==='/remix'?'amazon-workbench.remixDraft':'amazon-workbench.draft.'+(route==='/planner'?'planner':'simple');localStorage.setItem(key,JSON.stringify({productImages,entries,generationMode:'image'}))}
   },{route,image})
   await page.goto(BASE+route,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelectorAll('[data-generation-settings]').length===3)
   const clickGenerate=count=>page.evaluate(count=>{const button=[...document.querySelectorAll('[data-batch-generation] button')].find(x=>x.textContent.replace(/[▼✓]/g,'').trim()===`生成 ${count} 条`&&x.getBoundingClientRect().width>0);if(!button||button.disabled)throw new Error('Missing ready count '+count);button.click()},count)
   const summary=()=>page.$eval('[data-batch-generation]',x=>x.textContent.replace(/\s+/g,' ').trim())
   assert.ok((await summary()).includes('共 3 张'));assert.ok((await summary()).includes('生成 2 条'))
   const groups=await page.$$eval('[data-generation-settings]',elements=>elements.map(el=>({labels:[...el.querySelectorAll('label')].map(x=>x.textContent),values:[...el.querySelectorAll('[data-slot="select-trigger"]')].map(x=>x.textContent.replace(/[▼✓]/g,'').trim()),custom:el.querySelector('input[aria-label*="自定义比例"]')?.value})))
   assert.deepEqual(groups[0].labels,['输出比例','清晰度','生成数量']);assert.deepEqual(groups[0].values,['16:9 · 横版','2K','2']);assert.equal(groups[1].custom,'16:9')
   if(route==='/'){assert.equal(groups[2].custom,'16:9','历史像素在新控件显示准确比例');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.draft.workbench')).cards[2].customSize),'3840x2160','底层保留旧像素原值');assert.ok(await page.evaluate(()=>!document.body.innerText.includes('单独请求')));assert.ok(await page.evaluate(()=>document.body.innerText.includes('生成提示词 2 条')))}
   const choose=async value=>{const element=(await page.evaluateHandle(value=>[...document.querySelectorAll('[role="option"]')].find(x=>x.getBoundingClientRect().width>0&&x.textContent.replace(/[▼✓]/g,'').trim()===value),value)).asElement();if(!element)throw Error('Option missing '+value);await element.click();await page.waitForFunction(()=>![...document.querySelectorAll('[role="option"]')].some(x=>x.getBoundingClientRect().width>0))}
   const firstPrefix=route==='/'?'请求 1':'提示词 1'
   await page.click(`[aria-label="${firstPrefix} 的输出比例"]`);await page.waitForFunction(()=>[...document.querySelectorAll('[role="option"]')].filter(x=>x.getBoundingClientRect().width>0).length===10);const ratioOptions=await page.$$eval('[role="option"]',options=>options.filter(x=>x.getBoundingClientRect().width>0).map(x=>x.textContent.replace(/[▼✓]/g,'').trim()));assert.equal(ratioOptions.length,10)
   await choose('21:9 · 超宽')
   await page.focus(`[aria-label="${firstPrefix} 的清晰度"]`);await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>[...document.querySelectorAll('[role="option"]')].filter(x=>x.getBoundingClientRect().width>0).length===2);assert.deepEqual(await page.$$eval('[role="option"]',options=>options.filter(x=>x.getBoundingClientRect().width>0).map(x=>x.textContent.replace(/[▼✓]/g,'').trim())),['1K','2K']);await choose('1K')
   const checkbox=index=>route==='/'?`[aria-label="选择请求 ${index}"]`:`[aria-label="启用第 ${index} 条"]`
   await page.click(checkbox(3));assert.ok((await summary()).includes('生成 1 条'));await page.click(checkbox(2));assert.ok((await summary()).includes('共 6 张'));assert.ok((await summary()).includes('生成 2 条'))
   for(const width of [1440,390,320]){await page.setViewport({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow '+route+' '+width);await page.screenshot({path:`${OUT}/${route==='/'?'workbench':route.slice(1)}-${width}.png`,fullPage:true})}
   await page.setViewport({width:1440,height:1100});await delay(700);await page.reload({waitUntil:'networkidle0'});assert.ok((await summary()).includes('生成 2 条'));assert.ok(await page.$eval(`[aria-label="${firstPrefix} 的清晰度"]`,x=>x.textContent.replace(/[▼✓]/g,'').trim()==='1K'));assert.equal(await page.$eval(`[aria-label="${route==='/'?'请求 2':'提示词 2'} 的自定义比例"]`,x=>x.value),'16:9')
   await clickGenerate(2);await page.waitForFunction(()=>location.pathname==='/generate');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]').filter(x=>x.status==='success').length===2)
   assert.equal(requests.length,6);assert.ok(requests.every(x=>Number(x.imageCount)===1));assert.equal(requests.filter(x=>x.ratio==='21:9').length,2);assert.equal(requests.filter(x=>x.ratio==='custom').length,4);const first=requests.find(x=>x.ratio==='21:9'),second=requests.find(x=>x.ratio==='custom');assert.equal(first.ratio,'21:9');assert.equal(first.qualityLevel,'1k');assert.equal(first.requestedSize,'2464x1056');assert.equal(second.ratio,'custom');assert.equal(second.requestedSize,'1280x720');assert.deepEqual(errors,[])
   reports.push({route,sharedParameters:true,oldDimensionsPreserved:route==='/',readyTasks:2,totalImages:6,ratio:'21:9',quality:'1k',customSize:'1280x720',widths:[1440,390,320],requests:6});await context.close()
  }
  const page=await browser.newPage();for(const route of ['/settings','/suite','/assets','/profile']){const response=await page.goto(BASE+route,{waitUntil:'networkidle0'});assert.equal(response.status(),200);await page.setViewport({width:390,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' mobile overflow')}
  fs.writeFileSync(OUT+'/result.json',JSON.stringify({baseURL:BASE,reports,otherPagesChecked:['/settings','/suite','/assets','/profile'],paidCalls:0},null,2));console.log('PASS: 四页共享参数/启用/实时条数与图片数；旧像素/自定义保留；比例与1K实际请求；刷新保存；桌面手机；其余页面检查（模拟零费用）')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
