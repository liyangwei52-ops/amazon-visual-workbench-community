const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3006',OUT='verification/model-sizing'
const lines=fs.readFileSync('G:/2026/10月/测试/api.txt','utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
const endpoint=lines[lines.indexOf('生图Api网址')+1],key=lines[lines.indexOf('生图Key')+1]
async function main(){
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,protocolTimeout:1200000,args:['--no-sandbox']})
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000})
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  // Invalid credential checks native CORS without creating a paid generation.
  const cors=await page.evaluate(async()=>{try{const r=await fetch('https://api.openlux.ai/v1beta/models/gemini-3-pro-image-preview:generateContent',{method:'POST',headers:{Authorization:'Bearer invalid-cors-probe','Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:'cors probe'}]}]})});return{readable:true,status:r.status}}catch(e){return{readable:false,error:e.message}}})
  fs.writeFileSync(OUT+'/native-cors.json',JSON.stringify(cors,null,2));assert.ok(cors.readable,'Native CORS unavailable');assert.ok(cors.status>=400)
  const suite=JSON.parse(fs.readFileSync('verification/three-real-tests/saved-suites.json','utf8')).find(x=>x.name.startsWith('三项实测-草莓策划'))
  const prompt=suite.entries[3].prompt,product='data:image/jpeg;base64,'+fs.readFileSync('G:/2026/10月/测试/一键策划测试/1.jpg').toString('base64')
  const models=(process.env.TEST_MODELS||'gpt-image-2,gemini-3-pro-image-preview').split(',')
  for(const model of models){
   let providerCalls=0,proxyCalls=0
   const listener=r=>{if(r.method()==='POST'){if(r.url().startsWith('https://api.openlux.ai/'))providerCalls++;if(r.url().endsWith('/api/images'))proxyCalls++}}
   page.on('request',listener)
   await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
   await page.evaluate(({model,endpoint,key,prompt,product})=>{
    const connection={endpoint,apiKey:key,model}
    localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:connection,image:connection}))
    localStorage.setItem('amazon-workbench.draft.simple',JSON.stringify({generationMode:'image',productImage:{id:'real-sizing-product',name:'1.jpg',dataUrl:product},entries:[{id:'real-sizing-'+model,enabled:true,ratio:'custom',customSize:'1920x1080',quality:'2k',count:'1',prompt}]}))
   },{model,endpoint,key,prompt,product})
   await page.goto(BASE+'/simple',{waitUntil:'networkidle0'});await page.waitForSelector('img[alt="产品图"]')
   const started=Date.now();console.log('Submitting one image:',model)
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('开始生成')).click())
   await page.waitForFunction(()=>location.pathname==='/generate')
   await page.waitForFunction(()=>['success','failed','interrupted'].includes(JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]')[0]?.status),{timeout:960000})
   const task=await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0])
   const metadata={model,status:task.status,error:task.error,seconds:Math.round((Date.now()-started)/1000),providerCalls,proxyCalls,requestInfo:task.requestInfo,promptChars:prompt.length}
   fs.writeFileSync(`${OUT}/real-${model}.json`,JSON.stringify(metadata,null,2));assert.equal(task.status,'success',task.error)
   const data=await page.evaluate(async id=>{const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onsuccess=()=>resolve(r.result)});const urls=await new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get(id);r.onsuccess=()=>resolve(r.result)});db.close();return urls[0]},task.id)
   const buffer=Buffer.from(data.split(',')[1],'base64'),info=await sharp(buffer).metadata()
   fs.writeFileSync(`${OUT}/real-${model}.${info.format==='jpeg'?'jpg':info.format}`,buffer)
   assert.equal(task.requestInfo.size,`${info.width}x${info.height}`);assert.equal(providerCalls+proxyCalls,1,'Only one paid request')
   if(model==='gpt-image-2')assert.equal(task.requestInfo.size,'1920x1088')
   fs.writeFileSync(`${OUT}/real-${model}.json`,JSON.stringify({...metadata,width:info.width,height:info.height,bytes:buffer.length},null,2))
   await page.screenshot({path:`${OUT}/real-${model}-page.png`,fullPage:true});console.log(JSON.stringify({...metadata,width:info.width,height:info.height,bytes:buffer.length}))
   page.off('request',listener)
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.message.replaceAll(key,'[REDACTED]'));process.exitCode=1})
