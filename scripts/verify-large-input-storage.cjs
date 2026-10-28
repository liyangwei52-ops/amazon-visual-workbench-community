const assert = require('node:assert/strict')
const fs = require('node:fs')
const puppeteer = require('puppeteer-core')
const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII='
async function main() {
 const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-gpu']})
 try {
  const page=await browser.newPage()
  await page.goto('http://localhost:3000/',{waitUntil:'networkidle0'})
  await page.evaluate(()=>{
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:{apiKey:'test',endpoint:'https://api.openlux.ai/v1',model:'test'},image:{apiKey:'test',endpoint:'https://api.openlux.ai/v1',model:'test'}}))
   localStorage.setItem('amazon-workbench.draft.workbench',JSON.stringify({cards:Array.from({length:12},(_,i)=>({id:'storage-'+i,references:[],prompt:'【正向 Prompt】完整大素材测试。\n【负向 Prompt】禁止商品变形。',analysis:'',extraNeeds:'',size:'1024x1024',customSize:'',count:'1',quality:'auto',outputFormat:'png',background:'auto'}))}))
  })
  await page.reload({waitUntil:'networkidle0'})
  await (await page.$('input[type="file"]')).uploadFile(require('node:path').resolve('verification/analysis-noise.png'))
  await page.waitForSelector('img[alt="我方产品图"]')
  const card=(await page.evaluateHandle(()=>[...document.querySelectorAll('[data-slot="card"]')].find(x=>x.querySelector('textarea[placeholder^="点击「生成提示词」"]')))).asElement()
  for(let i=0;i<2;i++) {
   await (await card.$('input[type="file"]')).uploadFile(require('node:path').resolve('verification/analysis-noise.png'))
   await page.waitForFunction(n=>document.querySelectorAll('img[alt^="参考图"]').length===n,{},i+1)
  }
  await new Promise(r=>setTimeout(r,2000))
  const latest = '【正向 Prompt】最后一条最新编辑，刷新后不能回退。\n【负向 Prompt】禁止旧商品。'
  await page.$$eval('textarea[placeholder^="点击「生成提示词」"]',(fields,value)=>{
   const field=fields.at(-1)
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value)
   field.dispatchEvent(new Event('input',{bubbles:true}))
  },latest)
  await page.waitForFunction(()=>localStorage.getItem('amazon-workbench.draft.workbench').includes('最后一条最新编辑'))
  await page.reload({waitUntil:'networkidle0'})
  await page.waitForFunction(()=>document.querySelectorAll('img[alt^="参考图"]').length===2&&!!document.querySelector('img[alt="我方产品图"]'))
  const images=await page.$$eval('img',nodes=>nodes.map(x=>x.getAttribute('src').length))
  assert.ok(images[0]>3*1024*1024)
  assert.equal(await page.$$eval('textarea[placeholder^="点击「生成提示词」"]',fields=>fields.at(-1).value),latest)
  await page.evaluate((tiny)=>{
   window.__calls=[]
   const original=window.fetch
   window.fetch=async(input,init)=>{
    if(String(input)==='/api/images') {
     window.__calls.push({images:init.body.getAll('images').length,size:init.body.get('size')})
     return new Response(JSON.stringify({images:[{src:tiny}]}),{status:200,headers:{'Content-Type':'application/json'}})
    }
    return original(input,init)
   }
  },TINY)
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/生成全部|生图全部|全部生图/.test(x.textContent)).click())
  await page.waitForFunction(()=>location.pathname==='/generate')
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]').filter(x=>x.status==='success').length===12,{timeout:60000})
  const result=await page.evaluate(async()=>{
   const queue=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('amazon-workbench-inputs',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
   const record=await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get(queue[0].inputBatchId);r.onsuccess=()=>resolve(r.result)})
   db.close()
   return {calls:window.__calls,queueChars:JSON.stringify(queue).length,uniqueImages:record.images.length,tasks:record.tasks.length,inlineInputImages:queue.some(x=>x.productImageDataUrl||x.references?.length)}
  })
  assert.equal(result.calls.length,12)
  assert.equal(result.calls[0].images,3)
  assert.ok(result.calls.slice(1).every(x=>x.images===1))
  assert.equal(result.uniqueImages,1,'Duplicate image data must be stored once')
  assert.equal(result.tasks,12)
  assert.equal(result.inlineInputImages,false)
  assert.ok(result.queueChars<25000)
  await page.reload({waitUntil:'networkidle0'})
  await page.waitForSelector('img')
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')).filter(x=>x.status==='success').length),12)
  fs.writeFileSync('verification/large-input-storage.json',JSON.stringify(result,null,2))
  console.log('PASS: 大 PNG 产品和两张参考图刷新后全部恢复，12 路任务图片去重保存在 IndexedDB，localStorage 元数据小于 25KB；生图请求与结果恢复通过（模拟请求，无 API 花费）')
  console.log(JSON.stringify(result))
 } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
