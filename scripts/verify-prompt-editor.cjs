const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3010',OUT=path.resolve('verification/prompt-editor')
async function main(){
 fs.mkdirSync(OUT,{recursive:true})
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 const long='【正向 Prompt】\n'+('产品真实外观与完整构图、光线要求，不省略细节。\n'.repeat(1100))+'【负向 Prompt】不改变商品、不添加未知配件。',short='短提示词：真实商品，白底主图。',edited=long+'\n【新增测试内容】编辑后保留全文。'
 try{
  const page=await browser.newPage();await page.setViewport({width:1500,height:1000});const errors=[],results=[];let providerCalls=0
  page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>{if(r.url().startsWith('https://api.openlux.ai/')){providerCalls++;void r.abort()}else void r.continue()})
  await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:async value=>{window.__copiedPrompt=value},configurable:true}))
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  await page.evaluate(({long,short})=>{
   const entries=[long,short].map((prompt,index)=>({id:'prompt-'+index,prompt,enabled:true,size:'1:1',ratio:'1:1',quality:'1k',count:'1',customSize:'',title:'版位'+(index+1)}))
   localStorage.setItem('amazon-workbench.draft.workbench',JSON.stringify({productImages:[],cards:entries.map(x=>({...x,size:'1024x1024',references:[]}))}))
   localStorage.setItem('amazon-workbench.draft.simple',JSON.stringify({generationMode:'text',entries}))
   localStorage.setItem('amazon-workbench.draft.planner',JSON.stringify({productImages:[],entries}))
   localStorage.setItem('amazon-workbench.remixDraft',JSON.stringify({productImages:[],entries}))
   localStorage.setItem('amazon-workbench.draft.suite',JSON.stringify({name:'全屏编辑测试',entries}))
  },{long,short})
  const fill=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))},value)
  for(const route of ['/','/planner','/simple','/remix','/suite']){
   console.log('Checking',route)
   await page.goto(BASE+route,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelectorAll('[data-prompt-preview]').length===2)
   const sizes=await page.$$eval('[data-prompt-preview]',els=>els.map(el=>({height:el.getBoundingClientRect().height,fieldSizing:getComputedStyle(el).fieldSizing,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,length:el.value.length,resize:getComputedStyle(el).resize})))
   assert.deepEqual(sizes.map(x=>x.height),[160,160]);assert.ok(sizes.every(x=>x.fieldSizing==='fixed'&&x.resize==='none'));assert.equal(sizes[0].length,long.length);assert.ok(sizes[0].scrollHeight>sizes[0].clientHeight)
   const editorHeights=await page.$$eval('[data-prompt-editor]',els=>els.map(el=>el.getBoundingClientRect().height));assert.equal(editorHeights[0],editorHeights[1],'提示词预览及操作栏整体等高')
   if(route==='/')await page.screenshot({path:OUT+'/workbench-preview.png',fullPage:true})
   await page.click('[data-prompt-editor] button');await page.waitForSelector('[data-prompt-fullscreen][open]')
   const modal=await page.evaluate(()=>{const dialog=document.querySelector('[data-prompt-fullscreen][open]'),textarea=dialog.querySelector('textarea');return{height:dialog.getBoundingClientRect().height,width:dialog.getBoundingClientRect().width,viewportHeight:innerHeight,viewportWidth:innerWidth,length:textarea.value.length,textareaHeight:textarea.getBoundingClientRect().height,overflow:document.body.style.overflow,modal:dialog.matches(':modal')}})
   assert.equal(modal.length,long.length);assert.equal(modal.height,modal.viewportHeight);assert.equal(modal.width,modal.viewportWidth);assert.ok(modal.textareaHeight<modal.viewportHeight&&modal.textareaHeight>300);assert.equal(modal.overflow,'hidden');assert.ok(modal.modal)
   await fill('[data-prompt-fullscreen][open] textarea',edited)
   await page.evaluate(()=>[...document.querySelectorAll('[data-prompt-fullscreen][open] button')].find(x=>x.textContent.trim()==='复制全文').click());assert.equal(await page.evaluate(()=>window.__copiedPrompt),edited)
   await page.evaluate(()=>[...document.querySelectorAll('[data-prompt-fullscreen][open] button')].find(x=>x.textContent.trim()==='完成编辑').click());await page.waitForFunction(()=>!document.querySelector('[data-prompt-fullscreen][open]')&&document.body.style.overflow!=='hidden')
   assert.deepEqual(await page.$$eval('[data-prompt-preview]',x=>x.map(e=>e.value)),[edited,short]);assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden')
   await page.click('[data-prompt-editor] button');await page.waitForSelector('[data-prompt-fullscreen][open]');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[data-prompt-fullscreen][open]')&&document.body.style.overflow!=='hidden')
   await new Promise(r=>setTimeout(r,700));await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(expected=>document.querySelector('[data-prompt-preview]')?.value===expected,{},edited)
   assert.equal(await page.$$eval('[data-prompt-preview]',x=>x[1].value),short)
   results.push({route,previewHeights:sizes.map(x=>x.height),fullLength:long.length,fullscreenEdit:true,clipboardFullText:true,escClose:true,reloadPreserved:true})
  }
  await page.setViewport({width:390,height:844});await page.goto(BASE+'/',{waitUntil:'networkidle0'});await page.waitForSelector('[data-prompt-preview]');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:OUT+'/mobile-preview.png',fullPage:true})
  await page.click('[data-prompt-editor] button');await page.waitForSelector('[data-prompt-fullscreen][open]');assert.ok(await page.evaluate(()=>{const e=document.querySelector('[data-prompt-fullscreen][open]');return e.scrollWidth<=innerWidth&&e.scrollHeight<=innerHeight+1}));await page.screenshot({path:OUT+'/mobile-fullscreen.png',fullPage:false})
  assert.deepEqual(errors,[]);assert.equal(providerCalls,0)
  fs.writeFileSync(OUT+'/result.json',JSON.stringify({baseURL:BASE,results,mobileNoOverflow:true,providerCalls},null,2));console.log('PASS: 五页长短提示词固定160px；全文无截断；全屏编辑/复制/ESC；关闭回填与刷新恢复；手机无溢出；零API调用')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
