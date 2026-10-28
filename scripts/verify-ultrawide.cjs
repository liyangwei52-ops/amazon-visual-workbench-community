const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const puppeteer=require('puppeteer-core')
const sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3004'
const REAL=process.argv.includes('--real')
const OUT=path.resolve('verification/ultrawide')
fs.mkdirSync(OUT,{recursive:true})
async function main(){
 const image='data:image/png;base64,'+(await sharp({create:{width:3584,height:1536,channels:3,background:'#ffdada'}}).png().toBuffer()).toString('base64')
 let settings={analysis:{endpoint:'https://api.openlux.ai/v1',apiKey:'mock-only',model:'test'},image:{endpoint:'https://api.openlux.ai/v1',apiKey:'mock-only',model:'gpt-image-2'}}
 if(REAL){
  const lines=fs.readFileSync('G:/2026/10月/测试/api.txt','utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
  settings.image={endpoint:lines[lines.indexOf('生图Api网址')+1],apiKey:lines[lines.indexOf('生图Key')+1],model:lines.find(x=>x.startsWith('图像模型')).replace(/^图像模型[:：\s]*/,'')}
 }
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,protocolTimeout:1200000,args:['--no-sandbox']})
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000})
  const errors=[];page.on('pageerror',x=>errors.push(x.message))
  await page.evaluateOnNewDocument(()=>{const original=window.fetch;window.fetch=(input,init)=>{if(String(input).includes('/images/')){
   const body=init.body;const value=body instanceof FormData?{size:body.get('size'),count:body.get('n'),prompt:body.get('prompt')}:JSON.parse(body)
   sessionStorage.setItem('ultrawide-request',JSON.stringify(value))
  }return original(input,init)}})
  let providerCalls=0
  await page.setRequestInterception(true)
  page.on('request',request=>{
   if(request.url().startsWith('https://api.openlux.ai/')&&request.method()==='POST'){
    providerCalls++
    if(!REAL){void request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({data:[{b64_json:image.split(',')[1]},{b64_json:image.split(',')[1]}]})});return}
   }
   if(!REAL&&request.url().startsWith('https://api.openlux.ai/')&&request.method()==='OPTIONS'){void request.respond({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type'}});return}
   void request.continue()
  })
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  const product=REAL?'data:image/jpeg;base64,'+fs.readFileSync('G:/2026/10月/测试/一键策划测试/1.jpg').toString('base64'):''
  const suites=REAL?JSON.parse(fs.readFileSync('verification/three-real-tests/saved-suites.json','utf8')):[]
  const prompt=REAL?suites.find(x=>x.name.startsWith('三项实测-草莓策划')).entries[3].prompt:'完整产品提示词。\n\n【最终画布尺寸】严格使用用户当前设置的 3840x1620。'
  await page.evaluate(({settings,product,prompt,count})=>{
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify(settings))
   localStorage.setItem('amazon-workbench.generateQueue',JSON.stringify([{id:'ultrawide',label:'21:9尺寸修复验证',ratio:'21:9',quality:'2k',count,customSize:'',prompt,productImageDataUrl:product,status:'failed',error:'Invalid size 3840x1620',resultUrls:[],paused:false}]))
  },{settings,product,prompt,count:REAL?1:2})
  await page.goto(BASE+'/generate',{waitUntil:'networkidle0'})
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('3584x1536')))
  const start=Date.now()
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='重试本条').click())
  await page.waitForFunction(()=>{const task=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0];return task.status!=='running'&&task.status!=='queued'},{timeout:960000})
  const task=await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0])
  assert.equal(task.status,'success',task.error)
  const sent=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ultrawide-request')))
  assert.equal(sent.size,'3584x1536');assert.equal(String(sent.count||sent.n),REAL?'1':'2')
  assert.ok(sent.prompt.includes('【最终画布尺寸】严格使用用户当前设置的 3584x1536'))
  assert.ok(!sent.prompt.includes('【最终画布尺寸】严格使用用户当前设置的 3840x1620'))
  assert.equal(providerCalls,1)
  const result=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onsuccess=()=>resolve(r.result)});const result=await new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get('ultrawide');r.onsuccess=()=>resolve(r.result)});db.close();return result})
  const buffer=Buffer.from(result[0].split(',')[1],'base64')
  assert.equal(buffer.readUInt32BE(16),3584);assert.equal(buffer.readUInt32BE(20),1536)
  fs.writeFileSync(path.join(OUT,REAL?'real-21-9.png':'mock-21-9.png'),buffer)
  await page.screenshot({path:path.join(OUT,REAL?'real-page.png':'mock-page.png'),fullPage:true})
  if(!REAL){
   await page.evaluate(()=>{const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'));tasks[0]={...tasks[0],ratio:'custom',customSize:'3840x1620',status:'failed',resultUrls:[],resultsSaved:false};localStorage.setItem('amazon-workbench.generateQueue',JSON.stringify(tasks))})
   await page.reload({waitUntil:'networkidle0'})
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='重试本条').click())
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0].status==='failed')
   assert.ok(await page.evaluate(()=>document.body.innerText.includes('16的倍数')))
   assert.equal(providerCalls,1,'自定义非法尺寸不发给服务商')
   const proxy=await page.evaluate(async()=>{const form=new FormData();for(const [key,value]of Object.entries({endpoint:'https://api.openlux.ai/v1',apiKey:'mock',model:'gpt-image-2',prompt:'test',size:'3840x1620'}))form.set(key,value);const r=await fetch('/api/images',{method:'POST',body:form});return {status:r.status,...await r.json()}})
   assert.equal(proxy.status,400);assert.equal(proxy.outcome,'failed');assert.ok(proxy.error.includes('16的倍数'))
  }
  assert.deepEqual(errors,[])
  const metadata={baseURL:BASE,realProvider:REAL,status:'success',width:3584,height:1536,bytes:buffer.length,seconds:Math.round((Date.now()-start)/1000),providerCalls,oldFailedTaskRetry:true,promptSizeUpdated:true,invalidSizeBlocked:!REAL}
  fs.writeFileSync(path.join(OUT,REAL?'real-result.json':'mock-result.json'),JSON.stringify(metadata,null,2))
  console.log(JSON.stringify(metadata))
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
