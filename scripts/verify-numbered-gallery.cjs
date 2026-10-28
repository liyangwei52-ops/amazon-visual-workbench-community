const fs=require('node:fs')
const assert=require('node:assert/strict')
const puppeteer=require('puppeteer-core')
const sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3003'
async function main(){
 const images=await Promise.all(['#b45309','#0f766e','#4338ca','#be185d'].map(async(background,index)=>'data:image/png;base64,'+(await sharp({create:{width:1600,height:900,channels:3,background}}).composite([{input:Buffer.from(`<svg width="1600" height="900"><text x="800" y="500" text-anchor="middle" fill="white" font-family="Arial" font-size="200">${index+1}</text></svg>`)}]).png().toBuffer()).toString('base64')))
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage();await page.setViewport({width:1600,height:1000})
  const errors=[];let imageCalls=0
  page.on('pageerror',error=>errors.push(error.message))
  await page.evaluateOnNewDocument(()=>{const original=window.fetch;window.fetch=(input,init)=>{if(input==='/api/images')sessionStorage.setItem('gallery-request-count',String(init.body.get('imageCount')));return original(input,init)}})
  await page.setRequestInterception(true)
  page.on('request',request=>{
   if(request.url().endsWith('/api/provider-transport'))void request.respond({status:200,contentType:'application/json',body:JSON.stringify({mode:'proxy',baseURL:'https://api.openlux.ai/v1'})})
   else if(request.url().endsWith('/api/images')){imageCalls++;void request.respond({status:200,contentType:'application/json',body:JSON.stringify({images:images.slice(0,3).map(src=>({src}))})})}
   else if(request.url().startsWith('https://api.openlux.ai/')){errors.push('Unexpected paid provider request');void request.abort()}
   else void request.continue()
  })
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  await page.evaluate(async(images)=>{
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:{endpoint:'https://api.openlux.ai/v1',apiKey:'test-only',model:'test'},image:{endpoint:'https://api.openlux.ai/v1',apiKey:'test-only',model:'test'}}))
   localStorage.removeItem('amazon-workbench.queueHold')
   const make=(id,count,status='success')=>({id,label:id,ratio:'16:9',quality:'1k',count,prompt:'多图预览测试',status,resultUrls:[],resultsSaved:status==='success',productImageDataUrl:'',paused:false})
   const tasks=[make('three',3,'queued'),make('single',1),make('partial',3),make('four',4),make('extra',3)]
   const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('task-results');r.onsuccess=()=>resolve(r.result)})
   await new Promise(resolve=>{const tx=db.transaction('task-results','readwrite');const s=tx.objectStore('task-results');s.put(images.slice(0,1),'single');s.put(images.slice(0,2),'partial');s.put(images,'four');s.put(images,'extra');tx.oncomplete=resolve});db.close()
   localStorage.setItem('amazon-workbench.generateQueue',JSON.stringify(tasks))
  },images)
  await page.goto(BASE+'/generate',{waitUntil:'networkidle0'})
  try{await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0].status==='success')}
  catch(error){console.log(JSON.stringify(await page.evaluate(()=>({tasks:JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')).map(x=>({id:x.id,status:x.status,error:x.error})),text:document.body.innerText.slice(0,1700)}))));throw error}
  assert.equal(imageCalls,1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('gallery-request-count')),'3')
  const selector=id=>`[data-task-gallery="${id}"]`
  const buttons=id=>page.$$eval(selector(id)+' [aria-pressed]',els=>els.map(x=>x.textContent.trim()))
  assert.deepEqual(await buttons('three'),['1','2','3'])
  assert.deepEqual(await buttons('single'),['1'])
  assert.deepEqual(await buttons('four'),['1','2','3','4'])
  assert.deepEqual(await buttons('extra'),['1','2','3'],'设置3即使多返回图片也不显示第4个角标')
  for(const n of [2,3,1]){
   await page.click(selector('three')+` button[aria-label="查看第 ${n} 张图片"]`)
   assert.equal(await page.$eval(selector('three')+' img',x=>x.getAttribute('src')),images[n-1])
   assert.equal(await page.$eval(selector('three')+' [aria-pressed="true"]',x=>x.textContent.trim()),String(n))
   assert.equal(await page.$eval(selector('single')+' img',x=>x.getAttribute('src')),images[0])
   assert.equal(await page.$$eval(selector('three')+' img',x=>x.length),1)
  }
  await page.click(selector('partial')+' button[aria-label="查看第 3 张图片"]')
  assert.ok(await page.$eval(selector('partial'),x=>x.innerText.includes('第 3 张图片未返回')&&x.innerText.includes('2/3')))
  const geometry=await page.$eval(selector('three')+' img',x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height,fit:getComputedStyle(x).objectFit}))
  assert.ok(Math.abs(geometry.width/geometry.height-16/9)<0.02);assert.equal(geometry.fit,'contain')
  await page.screenshot({path:'verification/numbered-gallery-desktop.png',fullPage:true})
  await page.setViewport({width:390,height:844})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.click(selector('three')+' button[aria-label="查看第 3 张图片"]')
  assert.equal(await page.$eval(selector('three')+' img',x=>x.getAttribute('src')),images[2])
  await page.screenshot({path:'verification/numbered-gallery-mobile.png',fullPage:true})
  await page.reload({waitUntil:'networkidle0'})
  await page.waitForSelector(selector('three')+' img')
  assert.deepEqual(await buttons('three'),['1','2','3']);assert.equal(imageCalls,1,'切换与刷新不重发生成请求')
  assert.deepEqual(errors,[])
  console.log('PASS: 数量3只显示1/2/3；逐张切换与任务独立；单张/四张/少返回/多返回；比例完整；手机无溢出；真实请求参数n=3（响应模拟）；刷新不重跑，无付费请求')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
