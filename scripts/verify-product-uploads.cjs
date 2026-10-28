const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3009',OUT=path.resolve('verification/multi-products')
async function main(){
 fs.mkdirSync(OUT,{recursive:true});const files=[]
 for(let i=0;i<6;i++){const file=path.join(OUT,`fixture-${i+1}.png`);await sharp({create:{width:240+i*8,height:240,channels:3,background:['#e07070','#70c080','#7080e0','#e0c070','#c070d0','#70c0d0'][i]}}).png().toFile(file);files.push(file)}
 const output=fs.readFileSync(files[0]).toString('base64')
 const prompt='【提示词 1｜主视觉】\n【正向 Prompt】\n'+('完整商品、构图、光线和产品真实性要求。'.repeat(180))+'\n【负向 Prompt】禁止改造商品。'
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage();await page.setViewport({width:1500,height:1100});const client=await page.createCDPSession()
  const errors=[],analysis=[];let generations=0
  page.on('pageerror',error=>errors.push(error.message))
  await page.evaluateOnNewDocument(()=>{
   window.__uploadCalls=[];const original=window.fetch
   window.fetch=(url,init)=>{if(String(url).startsWith('https://api.openlux.ai/')&&init?.method==='POST'){
    const body=init.body
    if(body instanceof FormData)window.__uploadCalls.push({kind:'gpt',names:[...body.getAll('image[]'),...body.getAll('image')].map(f=>f.name),prompt:body.get('prompt')})
    else if(String(url).includes('/v1beta/')){const data=JSON.parse(body);window.__uploadCalls.push({kind:'gemini',parts:data.contents[0].parts})}
   }return original.call(window,url,init)}
  })
  await page.setRequestInterception(true)
  page.on('request',r=>{
   if(!r.url().startsWith('https://api.openlux.ai/')){void r.continue();return}
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type'}
   if(r.method()==='OPTIONS'){void r.respond({status:204,headers});return}
   let body
   if(r.url().includes('/chat/completions')){body=JSON.parse(r.postData());analysis.push(body);body={choices:[{finish_reason:'stop',message:{content:prompt}}]}}
   else {generations++;body=r.url().includes('/v1beta/')?{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:output}}]}}]}:{data:[{b64_json:output}]}}
   void r.respond({status:200,headers,contentType:'application/json',body:JSON.stringify(body)})
  })
  const click=label=>page.evaluate(label=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);if(!button)throw new Error('Missing button '+label);button.click()},label)
  const waitCount=count=>page.waitForFunction(count=>document.querySelectorAll('[data-product-index]').length===count,{},count)
  const names=()=>page.$$eval('[data-product-index]',items=>items.map(x=>x.querySelector('[title]').title))
  const drag=async(selector,paths)=>{
   const target=await page.$(selector);assert.ok(target,selector);await target.scrollIntoView();const b=await target.boundingBox(),x=b.x+Math.min(b.width/2,120),y=b.y+Math.min(b.height/2,150)
   const data={items:[],files:paths,dragOperationsMask:1}
   for(const type of ['dragEnter','dragOver','drop'])await client.send('Input.dispatchDragEvent',{type,x,y,data})
  }
  const seed=async(model='gpt-image-2')=>{
   await page.goto(BASE+'/settings',{waitUntil:'networkidle0'});await page.evaluate(model=>{const c={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-upload-only',model};localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:c,image:c}));localStorage.setItem('amazon-workbench.profile.v1',JSON.stringify({name:'拖拽测试',autoArchive:false}))},model)
  }
  await seed()
  await page.goto(BASE+'/',{waitUntil:'networkidle0'});console.log('Workbench drag')
  await drag('[data-upload-zone="workbench-product"]',files.slice(0,4));await waitCount(4);assert.deepEqual(await names(),files.slice(0,4).map(x=>path.basename(x)))
  await drag('[data-upload-zone="workbench-product"]',[files[4]]);assert.equal((await names()).length,4)
  await drag('[data-upload-zone^="workbench-refs-"]',files.slice(4));await page.waitForFunction(()=>document.querySelectorAll('img[alt^="参考图 "]').length===2)
  await page.click('[aria-label="设为主产品 fixture-3.png"]');await page.waitForFunction(()=>document.querySelector('[data-product-index="0"] [title]')?.title==='fixture-3.png')
  await new Promise(r=>setTimeout(r,750));await page.reload({waitUntil:'networkidle0'});await waitCount(4)
  assert.deepEqual(await names(),['fixture-3.png','fixture-1.png','fixture-2.png','fixture-4.png']);assert.equal(await page.$$eval('img[alt^="参考图 "]',x=>x.length),2)
  await page.screenshot({path:OUT+'/workbench.png',fullPage:true})
  await click('生成提示词');await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(x=>x.value.includes('完整商品、构图')))
  const content=analysis.at(-1).messages[1].content;const labels=content.filter(x=>x.type==='text').slice(1).map(x=>x.text)
  assert.equal(content.filter(x=>x.type==='image_url').length,6);assert.ok(labels[0].includes('主产品图'));assert.ok(labels[3].includes('补充产品图'));assert.ok(labels[4].includes('图5：竞品参考图'));assert.ok(labels[5].includes('图6：竞品参考图'))
  assert.ok(analysis.at(-1).messages[0].content.includes('从图5开始'))
  await click('全部生图');await page.waitForFunction(()=>location.pathname==='/generate');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]')[0]?.status==='success')
  const sent=await page.evaluate(()=>window.__uploadCalls.find(x=>x.kind==='gpt'));assert.deepEqual(sent.names,['fixture-3.png','fixture-1.png','fixture-2.png','fixture-4.png','fixture-5.png','fixture-6.png']);assert.ok(sent.prompt.includes('图5：竞品参考图'))
  const before=generations;await page.reload({waitUntil:'networkidle0'});assert.equal(generations,before,'刷新成功任务不重复调用')
  // Existing single-image drafts remain readable.
  await seed();await page.evaluate(dataUrl=>{localStorage.setItem('amazon-workbench.draft.simple',JSON.stringify({generationMode:'image',productImage:{id:'legacy',name:'旧产品.png',dataUrl},entries:[{id:'legacy-entry',enabled:true,prompt:'原有提示词',ratio:'1:1',quality:'1k',count:'1'}]}))},'data:image/png;base64,'+output)
  await page.goto(BASE+'/simple',{waitUntil:'networkidle0'});await waitCount(1);assert.equal((await names())[0],'旧产品.png')
  await page.click('[aria-label="移除产品图 1"]');await waitCount(0)
  await(await page.$('[aria-label="上传产品图片"]')).uploadFile(...files.slice(0,4));await waitCount(4)
  await page.click('[aria-label="移除产品图 1"]');await waitCount(3);assert.equal((await names())[0],'fixture-2.png')
  await page.click('[aria-label="替换产品图 2"]');await(await page.$('[aria-label="替换产品图片"]')).uploadFile(files[4]);await page.waitForFunction(()=>document.querySelector('[data-product-index="1"] [title]')?.title==='fixture-5.png')
  await drag('[data-upload-zone="simple-product"]',[files[3]]);await waitCount(4)
  await new Promise(r=>setTimeout(r,750));await page.reload({waitUntil:'networkidle0'});await waitCount(4)
  await page.setViewport({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:OUT+'/simple-mobile.png',fullPage:true});await page.setViewport({width:1500,height:1100})
  // Planner: four product images followed by every document reference, with corrected numbering.
  await seed();await page.evaluate(refs=>localStorage.setItem('amazon-workbench.draft.planner',JSON.stringify({planDoc:{fileName:'测试策划.xlsx',type:'xlsx',text:'主视觉 | 白底产品图',size:1000,images:refs.map((dataUrl,index)=>({dataUrl,name:'策划参考'+index,source:'Sheet1行'+index})),droppedImages:0},entries:[{id:'plan-test',enabled:true,title:'主视觉',prompt:'',size:'1:1',quality:'1k',count:'1'}]})),files.slice(4).map(x=>'data:image/png;base64,'+fs.readFileSync(x).toString('base64')))
  await page.goto(BASE+'/planner',{waitUntil:'networkidle0'});console.log('Planner drag');await drag('[data-upload-zone="planner-product"]',files.slice(0,4));await waitCount(4)
  await click('开始策划');await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(x=>x.value.includes('完整商品、构图')))
  const planContent=analysis.at(-1).messages[1].content;assert.equal(planContent.filter(x=>x.type==='image_url').length,6);assert.ok(planContent[0].text.includes('图5=策划参考0'));assert.ok(planContent[0].text.includes('图6=策划参考1'))
  await new Promise(r=>setTimeout(r,750));await page.reload({waitUntil:'networkidle0'});await waitCount(4)
  // Remix: all four images also reach rewriting and native Gemini generation.
  await seed('gemini-3-pro-image-preview');await page.evaluate(()=>localStorage.setItem('amazon-workbench.remixDraft',JSON.stringify({entries:[{id:'remix-test',enabled:true,prompt:'原套装完整提示词',size:'1:1',quality:'1k',count:'1'}]})))
  await page.goto(BASE+'/remix',{waitUntil:'networkidle0'});console.log('Remix drag');await drag('[data-upload-zone="remix-product"]',files.slice(0,4));await waitCount(4)
  await click('AI 改写全部');await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(x=>x.value.includes('完整商品、构图')));assert.equal(analysis.at(-1).messages[1].content.filter(x=>x.type==='image_url').length,4)
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('生图全部')).click());await page.waitForFunction(()=>location.pathname==='/generate');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]')[0]?.status==='success')
  const native=await page.evaluate(()=>window.__uploadCalls.find(x=>x.kind==='gemini'));assert.equal(native.parts.filter(x=>x.inline_data).length,4);assert.ok(native.parts[1].text.includes('主产品图'));assert.ok(native.parts[7].text.includes('补充产品图'))
  await page.goto(BASE+'/assets',{waitUntil:'networkidle0'});await drag('[data-upload-zone="asset-upload"]',files.slice(0,2));await page.waitForFunction(()=>document.querySelectorAll('[data-asset-id]').length===2);await new Promise(r=>setTimeout(r,400));assert.equal(await page.$$eval('[data-asset-id]',x=>x.length),2,'资产中心已有拖拽处理不能重复入库')
  assert.deepEqual(errors,[])
  const result={baseURL:BASE,nativeFileDrag:true,allFourPages:true,maxProductImages:4,firstImagePrimary:true,makePrimary:true,removeAndReplace:true,legacyDraftCompatible:true,reloadOrder:true,referenceDrag:true,assetDragNoDuplicates:true,analysisImages:[6,6,4],gptSubmittedImages:sent.names,nativeGeminiProductImages:4,noRefreshRetry:true,mobileNoOverflow:true,simulatedGenerations:generations,paidCalls:0}
  fs.writeFileSync(OUT+'/browser-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
